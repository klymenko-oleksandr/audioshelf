-- One-off seed: copy the four v1 books from `legacy_v1` into the new catalogue tables.
--
-- The audio and covers stay where they are (v1 objects under `audio/` and `covers/`); only
-- the keys are copied. Content track C1 later re-encodes the books under `books/…`.
--
-- Safe to run more than once: books that already exist (by slug) are left alone, and on a
-- database without the v1 tables it does nothing. Run it in the Supabase SQL editor.
--
-- Slugs come from lib/slug.ts (official Ukrainian romanisation) and were fixed in Phase 2.

DO $seed$
DECLARE
  fiction uuid;
BEGIN
  IF to_regclass('legacy_v1."Book"') IS NULL THEN
    RAISE NOTICE 'legacy_v1."Book" not found: nothing to seed.';
    RETURN;
  END IF;

  -- v1 had no categories; publishing needs one. More are added in the admin (Phase 4).
  INSERT INTO categories (slug, name_uk, name_en, position)
  VALUES ('fiction', 'Художня література', 'Fiction', 1)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO fiction FROM categories WHERE slug = 'fiction';

  DROP TABLE IF EXISTS pg_temp.v1_map;
  CREATE TEMP TABLE v1_map (v1_id text PRIMARY KEY, book_slug text, author_slug text) ON COMMIT DROP;
  INSERT INTO v1_map VALUES
    ('cmjetnl8m0002w69438ax1ppv', 'hesse-siddhartha', 'herman-hesse'),
    ('cmjha80fa0000y8mpdj47z6tz', 'orwell-kolhosp-tvaryn', 'dzhordzh-orvell'),
    ('cmjetgivj0000w69407v3o0v5', 'raspe-pryhody-barona-miunkhauzena', 'rudolf-erikh-raspe'),
    ('cmjak7xzn0000htjw4tydkiu5', 'tolkin-bratstvo-persnia', 'dzhon-tolkin');

  INSERT INTO authors (slug, name)
  SELECT DISTINCT m.author_slug, b.author
  FROM legacy_v1."Book" b
  JOIN v1_map m ON m.v1_id = b.id
  ON CONFLICT (slug) DO NOTHING;

  -- Only books that are not in the catalogue yet get tracks and chapters below.
  DROP TABLE IF EXISTS pg_temp.v1_new;
  CREATE TEMP TABLE v1_new (v1_id text PRIMARY KEY, book_id uuid) ON COMMIT DROP;

  WITH inserted AS (
    INSERT INTO books (
      slug, title, description, language, author_id, category_id, status, published_at,
      cover_large_key, cover_medium_key, cover_small_key, duration_seconds
    )
    SELECT
      m.book_slug,
      b.title,
      nullif(btrim(b.description), ''),
      'uk',
      a.id,
      fiction,
      'published',
      b."createdAt" AT TIME ZONE 'UTC',
      coalesce(b."coverLargeKey", b."coverObjectKey"),
      coalesce(b."coverMediumKey", b."coverLargeKey", b."coverObjectKey"),
      coalesce(b."coverThumbnailKey", b."coverMediumKey", b."coverObjectKey"),
      (SELECT coalesce(sum(c.duration), 0) FROM legacy_v1."Chapter" c WHERE c."bookId" = b.id)
    FROM legacy_v1."Book" b
    JOIN v1_map m ON m.v1_id = b.id
    JOIN authors a ON a.slug = m.author_slug
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug
  )
  INSERT INTO v1_new (v1_id, book_id)
  SELECT m.v1_id, i.id FROM inserted i JOIN v1_map m ON m.book_slug = i.slug;

  -- v1 had one audio file per chapter, so each becomes one track and one chapter.
  INSERT INTO tracks (book_id, position, r2_key, mime_type, duration_seconds, status)
  SELECT
    n.book_id,
    row_number() OVER (PARTITION BY c."bookId" ORDER BY c."order", c."createdAt"),
    c."objectKey",
    coalesce(c."mimeType", 'audio/mpeg'),
    c.duration,
    'ready'
  FROM legacy_v1."Chapter" c
  JOIN v1_new n ON n.v1_id = c."bookId";

  INSERT INTO chapters (book_id, position, title, start_seconds, end_seconds)
  SELECT
    n.book_id,
    row_number() OVER w,
    c.title,
    coalesce(sum(c.duration) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
    sum(c.duration) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
  FROM legacy_v1."Chapter" c
  JOIN v1_new n ON n.v1_id = c."bookId"
  WINDOW w AS (PARTITION BY c."bookId" ORDER BY c."order", c."createdAt");

  -- v1 titles carried file-name noise ("01. БРАХМАНСЬКИЙ СИН "); these are the cleaned ones.
  UPDATE chapters c SET title = v.title, updated_at = now()
  FROM (VALUES
    ('hesse-siddhartha', 1, 'Брахманський син'),
    ('hesse-siddhartha', 2, 'У саман'),
    ('hesse-siddhartha', 3, 'Гаутама'),
    ('hesse-siddhartha', 4, 'Пробудження'),
    ('hesse-siddhartha', 5, 'Камала'),
    ('hesse-siddhartha', 6, 'Серед звичайних людей'),
    ('hesse-siddhartha', 7, 'Сансара'),
    ('hesse-siddhartha', 8, 'На річці'),
    ('hesse-siddhartha', 9, 'Перевізник'),
    ('hesse-siddhartha', 10, 'Син'),
    ('hesse-siddhartha', 11, 'Ом'),
    ('hesse-siddhartha', 12, 'Говінда'),
    ('orwell-kolhosp-tvaryn', 1, 'Розділ 1'),
    ('orwell-kolhosp-tvaryn', 2, 'Розділ 2'),
    ('orwell-kolhosp-tvaryn', 3, 'Розділ 3'),
    ('orwell-kolhosp-tvaryn', 4, 'Розділ 4'),
    ('orwell-kolhosp-tvaryn', 5, 'Розділ 5'),
    ('orwell-kolhosp-tvaryn', 6, 'Розділ 6'),
    ('orwell-kolhosp-tvaryn', 7, 'Розділ 7'),
    ('orwell-kolhosp-tvaryn', 8, 'Розділ 8'),
    ('raspe-pryhody-barona-miunkhauzena', 1, 'Пригоди барона Мюнхаузена'),
    ('tolkin-bratstvo-persnia', 1, 'Пролог. Про гобітів'),
    ('tolkin-bratstvo-persnia', 2, 'Про люлькове зілля'),
    ('tolkin-bratstvo-persnia', 3, 'Про устрій Ширу'),
    ('tolkin-bratstvo-persnia', 4, 'Про віднайдення Персня'),
    ('tolkin-bratstvo-persnia', 5, 'Зауваги щодо ширських літописів'),
    ('tolkin-bratstvo-persnia', 6, 'Розділ 1. Довгоочікувана гостина'),
    ('tolkin-bratstvo-persnia', 7, 'Розділ 2. Тінь минулого'),
    ('tolkin-bratstvo-persnia', 8, 'Розділ 3. Троє — це вже загін'),
    ('tolkin-bratstvo-persnia', 9, 'Розділ 4. Навпростець по гриби'),
    ('tolkin-bratstvo-persnia', 10, 'Розділ 5. Змову викрито'),
    ('tolkin-bratstvo-persnia', 11, 'Розділ 6. Праліс'),
    ('tolkin-bratstvo-persnia', 12, 'Розділ 7. У домі Тома Бомбадила'),
    ('tolkin-bratstvo-persnia', 13, 'Розділ 8. Туман понад Курганними Пагорбами'),
    ('tolkin-bratstvo-persnia', 14, 'Розділ 9. Під вивіскою «Брикливий поні»'),
    ('tolkin-bratstvo-persnia', 15, 'Розділ 10. Бурлака'),
    ('tolkin-bratstvo-persnia', 16, 'Розділ 11. Ніж у темряві'),
    ('tolkin-bratstvo-persnia', 17, 'Розділ 12. Втеча до Броду')
  ) AS v(slug, position, title)
  JOIN books b ON b.slug = v.slug
  JOIN v1_new n ON n.book_id = b.id
  WHERE c.book_id = b.id AND c.position = v.position AND c.title IS DISTINCT FROM v.title;

  RAISE NOTICE 'Seeded % book(s) from legacy_v1.', (SELECT count(*) FROM v1_new);
END
$seed$;
