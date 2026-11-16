-- Catalogue for the end-to-end tests. Audio is the three generated tones in
-- public/dev/audio (NEXT_PUBLIC_MEDIA_BASE_URL points there during the tests).

INSERT INTO categories (id, slug, name_uk, name_en, position) VALUES
  ('10000000-0000-4000-8000-000000000001', 'fiction', 'Художня література', 'Fiction', 1),
  -- No books: never offered as a chip, a tile or a Home row; its own page says it is empty.
  ('10000000-0000-4000-8000-000000000002', 'poetry', 'Поезія', 'Poetry', 0);

-- "Автор Чернеток" has nothing published, so listeners never see an author page for them.
INSERT INTO authors (id, slug, name, bio) VALUES
  ('20000000-0000-4000-8000-000000000001', 'lesia-testova', 'Леся Тестова',
   'Вигадана авторка для перевірки сторінки автора.'),
  ('20000000-0000-4000-8000-000000000002', 'avtor-chernetok', 'Автор Чернеток', NULL);

INSERT INTO narrators (id, slug, name) VALUES
  ('40000000-0000-4000-8000-000000000001', 'ostap-chytets', 'Остап Читець');

-- "Старша книга" is ongoing (more parts coming) and has no description or narrator.
INSERT INTO books (id, slug, title, description, author_id, narrator_id, category_id, status, published_at, duration_seconds, ongoing) VALUES
  ('30000000-0000-4000-8000-000000000001', 'try-tony', 'Три тони',
   'Коротка книга з трьох тонів для перевірки програвача.',
   '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001',
   'published', '2026-03-01T00:00:00Z', 16.11, false),
  ('30000000-0000-4000-8000-000000000002', 'starsha-knyha', 'Старша книга', NULL,
   '20000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001',
   'published', '2026-01-01T00:00:00Z', 6.03, true),
  ('30000000-0000-4000-8000-000000000003', 'chernetka', 'Чернетка', NULL,
   '20000000-0000-4000-8000-000000000001', NULL, '10000000-0000-4000-8000-000000000001',
   'draft', NULL, 6.03, false);

INSERT INTO tracks (book_id, position, r2_key, duration_seconds, status) VALUES
  ('30000000-0000-4000-8000-000000000001', 1, 'tone-1.mp3', 6.03, 'ready'),
  ('30000000-0000-4000-8000-000000000001', 2, 'tone-2.mp3', 6.03, 'ready'),
  ('30000000-0000-4000-8000-000000000001', 3, 'tone-3.mp3', 4.05, 'ready'),
  ('30000000-0000-4000-8000-000000000002', 1, 'tone-1.mp3', 6.03, 'ready'),
  ('30000000-0000-4000-8000-000000000003', 1, 'tone-1.mp3', 6.03, 'ready');

INSERT INTO chapters (book_id, position, title, start_seconds, end_seconds) VALUES
  ('30000000-0000-4000-8000-000000000001', 1, 'Перший тон', 0, 6.03),
  ('30000000-0000-4000-8000-000000000001', 2, 'Другий тон', 6.03, 12.06),
  ('30000000-0000-4000-8000-000000000001', 3, 'Третій тон', 12.06, 16.11),
  ('30000000-0000-4000-8000-000000000002', 1, 'Єдиний розділ', 0, 6.03),
  ('30000000-0000-4000-8000-000000000003', 1, 'Єдиний розділ', 0, 6.03);
