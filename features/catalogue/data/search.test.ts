// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { searchCatalogue, searchStem, searchTokens } from './queries';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

async function book(
  slug: string,
  title: string,
  values: Partial<typeof schema.books.$inferInsert> = {},
) {
  await t.db.insert(schema.books).values({
    slug,
    title,
    status: 'published',
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    durationSeconds: 3600,
    ...values,
  });
}

beforeAll(async () => {
  t = await createTestDb();
  const insert = async <T extends typeof schema.authors | typeof schema.narrators>(
    table: T,
    slug: string,
    name: string,
  ) => {
    const [row] = await t.db
      .insert(table)
      .values({ slug, name } as never)
      .returning();
    return (row as { id: string }).id;
  };
  const tolkien = await insert(schema.authors, 'dzhon-tolkin', 'Джон Толкін');
  const doyle = await insert(schema.authors, 'artur-konan-doyl', 'Артур Конан Дойл');
  const unpublished = await insert(schema.authors, 'only-drafts', 'Чернетковий Автор');
  const stupka = await insert(schema.narrators, 'ostap-stupka', 'Остап Ступка');
  const clarke = await insert(schema.narrators, 'david-clarke', 'David Clarke');

  await book('bratstvo-persnia', 'Братство персня', { authorId: tolkien, narratorId: stupka });
  await book('dvi-tverdyni', 'Дві твердині', { authorId: tolkien, narratorId: stupka });
  await book('holmes', 'The Adventures of Sherlock Holmes', {
    authorId: doyle,
    narratorId: clarke,
    publishedAt: new Date('2026-03-01T00:00:00Z'),
  });
  await book('hound', 'The Hound of the Baskervilles', { authorId: doyle, narratorId: clarke });
  await book('draft', 'Перстень чернетка', { authorId: unpublished, status: 'draft' });
  await book('deleted', 'Перстень видалена', { authorId: unpublished, deletedAt: new Date() });
}, 60_000);

afterAll(() => t.close());

const slugs = async (query: string) =>
  (await searchCatalogue(t.db, query)).books.map((b) => b.slug);

describe('searchTokens / searchStem', () => {
  it('splits a query into lower-case words without punctuation', () => {
    expect(searchTokens('  Sherlock,  HOLMES! ')).toEqual(['sherlock', 'holmes']);
    expect(searchTokens('Кобзар №2')).toEqual(['кобзар', '2']);
    expect(searchTokens('   ')).toEqual([]);
  });

  it('keeps at most five words, each cut to 40 letters', () => {
    expect(searchTokens('a b c d e f g')).toHaveLength(5);
    expect(searchTokens('x'.repeat(100))[0]).toHaveLength(40);
  });

  it('keeps the start of a word that survives inflection', () => {
    expect(searchStem('перстень')).toBe('перс');
    expect(searchStem('персня')).toBe('перс');
    expect(searchStem('книга')).toBe('книг');
    expect(searchStem('кіт')).toBe('кіт');
  });
});

describe('searchCatalogue', () => {
  it('finds a book by the word in another form: "перстень" finds "Братство персня"', async () => {
    expect(await slugs('перстень')).toEqual(['bratstvo-persnia']);
  });

  it('ignores case and accents', async () => {
    expect(await slugs('БРАТСТВО')).toEqual(['bratstvo-persnia']);
    expect(await slugs('holmes')).toEqual(['holmes']);
    expect(await slugs('Толкин')).toEqual(['bratstvo-persnia', 'dvi-tverdyni']);
  });

  it('forgives a typo', async () => {
    expect(await slugs('sherlok')).toEqual(['holmes']);
    expect(await slugs('holms')).toEqual(['holmes']);
  });

  it('needs every word to match, in any order and any field', async () => {
    expect(await slugs('holmes дойл')).toEqual(['holmes']);
    expect(await slugs('конан holmes')).toEqual(['holmes']);
    expect(await slugs('holmes толкін')).toEqual([]);
  });

  it('finds books by author and by narrator', async () => {
    expect(await slugs('толкін')).toEqual(['bratstvo-persnia', 'dvi-tverdyni']);
    expect(await slugs('clarke')).toEqual(['holmes', 'hound']);
  });

  it('puts a title match before an author or narrator match', async () => {
    const results = await slugs('остап');
    expect(results).toEqual(['bratstvo-persnia', 'dvi-tverdyni']);
  });

  it('never returns drafts or deleted books, nor people who only have those', async () => {
    const results = await searchCatalogue(t.db, 'чернетка');
    expect(results.books).toEqual([]);
    expect((await searchCatalogue(t.db, 'видалена')).books).toEqual([]);
    expect((await searchCatalogue(t.db, 'чернетковий')).authors).toEqual([]);
  });

  it('returns authors and narrators with their live book counts', async () => {
    const results = await searchCatalogue(t.db, 'толкін');
    expect(results.authors).toEqual([{ slug: 'dzhon-tolkin', name: 'Джон Толкін', bookCount: 2 }]);
    expect(results.narrators).toEqual([]);

    const narrators = await searchCatalogue(t.db, 'ступка');
    expect(narrators.narrators).toEqual([
      { slug: 'ostap-stupka', name: 'Остап Ступка', bookCount: 2 },
    ]);
  });

  it('gives a book row what it shows', async () => {
    const [found] = (await searchCatalogue(t.db, 'holmes')).books;
    expect(found).toMatchObject({
      slug: 'holmes',
      title: 'The Adventures of Sherlock Holmes',
      author: { slug: 'artur-konan-doyl', name: 'Артур Конан Дойл' },
      narrator: { slug: 'david-clarke', name: 'David Clarke' },
      durationSeconds: 3600,
      language: 'uk',
      ongoing: false,
    });
  });

  it('finds nothing for an empty or unrelated query, without failing', async () => {
    expect(await searchCatalogue(t.db, '')).toEqual({ books: [], authors: [], narrators: [] });
    expect(await searchCatalogue(t.db, '!!!')).toEqual({ books: [], authors: [], narrators: [] });
    expect(await slugs('zzzzzz')).toEqual([]);
  });

  it('treats quotes, percent signs and SQL as plain text', async () => {
    expect(await slugs("'; drop table books; --")).toEqual([]);
    expect(await slugs('100%')).toEqual([]);
    expect(await slugs('holmes')).toEqual(['holmes']);
  });

  it('does not match short words inside other words', async () => {
    // "of" is a word of a title, but "o" must not match everything starting with o.
    expect(await slugs('ab')).toEqual([]);
  });
});
