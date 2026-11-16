// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { validateBook } from '@/features/player/core';
import { createTestDb } from '@/tests/test-db';
import {
  getAuthorBySlug,
  getBookBySlug,
  getCategoryBySlug,
  getPlayerBook,
  listAllBooks,
  listBooksByIds,
  listCategories,
  listCategoryRows,
  listNewReleases,
  MAX_BOOK_IDS,
} from './queries';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
const ids: Record<string, string> = {};

const BASE = 'https://media.test';

async function addBook(
  slug: string,
  values: Partial<typeof schema.books.$inferInsert> = {},
  parts: number[] = [600, 1200],
) {
  const [book] = await t.db
    .insert(schema.books)
    .values({
      slug,
      title: `Book ${slug}`,
      status: 'published',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      authorId: ids.author,
      categoryId: ids.category,
      durationSeconds: parts.reduce((sum, part) => sum + part, 0),
      ...values,
    })
    .returning({ id: schema.books.id });
  const bookId = book!.id;
  ids[slug] = bookId;

  let start = 0;
  for (const [index, duration] of parts.entries()) {
    await t.db.insert(schema.tracks).values({
      bookId,
      position: index + 1,
      r2Key: `books/${slug}/audio/${String(index + 1).padStart(2, '0')}-part.mp3`,
      durationSeconds: duration,
      status: 'ready',
    });
    await t.db.insert(schema.chapters).values({
      bookId,
      position: index + 1,
      title: `Chapter ${index + 1}`,
      startSeconds: start,
      endSeconds: start + duration,
    });
    start += duration;
  }
  return bookId;
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL = BASE;
  t = await createTestDb();

  const [author] = await t.db
    .insert(schema.authors)
    .values({ slug: 'herman-hesse', name: 'Герман Гессе' })
    .returning();
  const [narrator] = await t.db
    .insert(schema.narrators)
    .values({ slug: 'reader', name: 'Читець' })
    .returning();
  const [category] = await t.db
    .insert(schema.categories)
    .values({ slug: 'fiction', nameUk: 'Художня література', nameEn: 'Fiction' })
    .returning();
  // Sorted before "fiction" by position; "empty" has no live books at all.
  const [poetry] = await t.db
    .insert(schema.categories)
    .values({ slug: 'poetry', nameUk: 'Поезія', position: -1 })
    .returning();
  await t.db.insert(schema.categories).values({ slug: 'empty', nameUk: 'Порожня', position: -2 });
  ids.author = author!.id;
  ids.category = category!.id;
  ids.poetry = poetry!.id;

  await addBook('older', { publishedAt: new Date('2026-01-01T00:00:00Z') });
  await addBook('newer', {
    publishedAt: new Date('2026-03-01T00:00:00Z'),
    narratorId: narrator!.id,
    description: 'About the book.',
    coverLargeKey: 'books/newer/cover/abc-1000.webp',
    coverMediumKey: 'books/newer/cover/abc-500.webp',
    ongoing: true,
  });
  await addBook('draft', { status: 'draft', publishedAt: null });
  await addBook('scheduled', { status: 'scheduled', publishedAt: null });
  await addBook('deleted', { deletedAt: new Date() });
  await addBook('no-author', { authorId: null, publishedAt: new Date('2025-01-01T00:00:00Z') });
  await addBook('poem', { categoryId: ids.poetry, publishedAt: new Date('2024-01-01T00:00:00Z') });
  await addBook('poem-draft', { categoryId: ids.poetry, status: 'draft', publishedAt: null });
}, 60_000);

afterAll(() => t.close());

describe('listNewReleases', () => {
  it('returns live books only, newest first', async () => {
    const books = await listNewReleases(t.db);
    expect(books.map((book) => book.slug)).toEqual(['newer', 'older', 'no-author', 'poem']);
  });

  it('gives a card everything it shows, and no tracks', async () => {
    const [newer] = await listNewReleases(t.db, 1);
    expect(newer).toEqual({
      id: ids.newer,
      slug: 'newer',
      title: 'Book newer',
      author: { slug: 'herman-hesse', name: 'Герман Гессе' },
      coverUrl: `${BASE}/books/newer/cover/abc-500.webp`,
      durationSeconds: 1800,
      language: 'uk',
      ongoing: true,
    });
  });

  it('copes with a book that has no author or cover', async () => {
    const book = (await listNewReleases(t.db)).find((item) => item.slug === 'no-author');
    expect(book?.author).toBeNull();
    expect(book?.coverUrl).toBeUndefined();
  });
});

describe('listCategoryRows', () => {
  it('lists categories in their order with live books newest first, skipping empty ones', async () => {
    const rows = await listCategoryRows(t.db);
    expect(rows.map((row) => [row.slug, row.books.map((book) => book.slug)])).toEqual([
      ['poetry', ['poem']],
      ['fiction', ['newer', 'older', 'no-author']],
    ]);
    expect(rows[0]).toMatchObject({ nameUk: 'Поезія', nameEn: null });
    expect(rows[1]).toMatchObject({ nameUk: 'Художня література', nameEn: 'Fiction' });
  });

  it('caps the books per row', async () => {
    const rows = await listCategoryRows(t.db, 1);
    expect(rows.map((row) => row.books.map((book) => book.slug))).toEqual([['poem'], ['newer']]);
  });
});

describe('listCategories', () => {
  it('lists categories that have live books, in their order, with live counts', async () => {
    expect(await listCategories(t.db)).toEqual([
      { slug: 'poetry', nameUk: 'Поезія', nameEn: null, bookCount: 1 },
      { slug: 'fiction', nameUk: 'Художня література', nameEn: 'Fiction', bookCount: 3 },
    ]);
  });
});

describe('listAllBooks', () => {
  it('returns every live book, newest first', async () => {
    const books = await listAllBooks(t.db);
    expect(books.map((book) => book.slug)).toEqual(['newer', 'older', 'no-author', 'poem']);
  });
});

describe('getCategoryBySlug', () => {
  it('returns the category with its live books, newest first', async () => {
    const category = await getCategoryBySlug(t.db, 'fiction');
    expect(category).toMatchObject({
      slug: 'fiction',
      nameUk: 'Художня література',
      nameEn: 'Fiction',
    });
    expect(category).not.toHaveProperty('id');
    expect(category?.books.map((book) => book.slug)).toEqual(['newer', 'older', 'no-author']);
    expect(category?.books[0]).toMatchObject({
      author: { slug: 'herman-hesse', name: 'Герман Гессе' },
      coverUrl: `${BASE}/books/newer/cover/abc-500.webp`,
    });
  });

  it('keeps books of other categories and drafts out', async () => {
    const poetry = await getCategoryBySlug(t.db, 'poetry');
    expect(poetry?.books.map((book) => book.slug)).toEqual(['poem']);
  });

  it('returns a category without live books as an empty list, and null for an unknown slug', async () => {
    expect(await getCategoryBySlug(t.db, 'empty')).toMatchObject({ slug: 'empty', books: [] });
    expect(await getCategoryBySlug(t.db, 'missing')).toBeNull();
    expect(await getCategoryBySlug(t.db, "'; drop table books; --")).toBeNull();
  });
});

describe('getAuthorBySlug', () => {
  it('returns the author with live books newest first, total length and narrators', async () => {
    const author = await getAuthorBySlug(t.db, 'herman-hesse');
    expect(author).toMatchObject({
      slug: 'herman-hesse',
      name: 'Герман Гессе',
      bio: null,
      durationSeconds: 5400,
      narrators: [{ slug: 'reader', name: 'Читець', bookCount: 1 }],
    });
    expect(author).not.toHaveProperty('id');
    // Across categories; the draft, scheduled and deleted books stay out.
    expect(author?.books.map((book) => book.slug)).toEqual(['newer', 'older', 'poem']);
  });

  it('returns null for an unknown author and for one with no live books', async () => {
    const [ghost] = await t.db
      .insert(schema.authors)
      .values({ slug: 'ghost', name: 'Автор Чернеток', bio: 'Ще нічого не видано.' })
      .returning();
    await addBook('ghost-draft', { authorId: ghost!.id, status: 'draft', publishedAt: null });

    expect(await getAuthorBySlug(t.db, 'ghost')).toBeNull();
    expect(await getAuthorBySlug(t.db, 'missing')).toBeNull();
  });
});

describe('listBooksByIds', () => {
  it('returns card data with chapter starts for live books only', async () => {
    const books = await listBooksByIds(t.db, [
      ids.older!,
      ids.newer!,
      ids.draft!,
      ids.deleted!,
      '00000000-0000-4000-8000-000000000000',
      'not-a-uuid',
      "'; drop table books; --",
    ]);
    expect(books.map((book) => book.slug).sort()).toEqual(['newer', 'older']);
    const newer = books.find((book) => book.slug === 'newer');
    expect(newer).toMatchObject({
      id: ids.newer,
      title: 'Book newer',
      author: { slug: 'herman-hesse', name: 'Герман Гессе' },
      durationSeconds: 1800,
      ongoing: true,
      chapterStarts: [0, 600],
    });
  });

  it('answers nothing for no usable ids and ignores ids past the limit', async () => {
    expect(await listBooksByIds(t.db, [])).toEqual([]);
    expect(await listBooksByIds(t.db, ['junk'])).toEqual([]);
    const padding = Array.from(
      { length: MAX_BOOK_IDS },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(await listBooksByIds(t.db, [...padding, ids.newer!])).toEqual([]);
  });
});

describe('getBookBySlug', () => {
  it('returns the page data with chapters in order', async () => {
    const book = await getBookBySlug(t.db, 'newer');
    expect(book).toMatchObject({
      slug: 'newer',
      description: 'About the book.',
      narrator: { slug: 'reader', name: 'Читець' },
      category: { slug: 'fiction', nameUk: 'Художня література', nameEn: 'Fiction' },
      coverLargeUrl: `${BASE}/books/newer/cover/abc-1000.webp`,
    });
    expect(book?.chapters.map(({ title, start, end }) => [title, start, end])).toEqual([
      ['Chapter 1', 0, 600],
      ['Chapter 2', 600, 1800],
    ]);
  });

  it.each(['draft', 'scheduled', 'deleted', 'missing'])('hides a %s book', async (slug) => {
    expect(await getBookBySlug(t.db, slug)).toBeNull();
  });
});

describe('getPlayerBook', () => {
  it('returns a book the player accepts: ready tracks in order with public URLs', async () => {
    const book = await getPlayerBook(t.db, ids.newer!);
    expect(book).toMatchObject({
      id: ids.newer,
      slug: 'newer',
      title: 'Book newer',
      author: 'Герман Гессе',
      ongoing: true,
      coverUrl: `${BASE}/books/newer/cover/abc-500.webp`,
    });
    expect(book?.tracks.map(({ url, duration }) => [url, duration])).toEqual([
      [`${BASE}/books/newer/audio/01-part.mp3`, 600],
      [`${BASE}/books/newer/audio/02-part.mp3`, 1200],
    ]);
    expect(validateBook(book!)).toEqual([]);
  });

  it('leaves out tracks that are not ready', async () => {
    await t.db.insert(schema.tracks).values({
      bookId: ids.older!,
      position: 3,
      r2Key: 'books/older/audio/03-part.mp3',
      durationSeconds: 300,
      status: 'failed',
    });
    const book = await getPlayerBook(t.db, ids.older!);
    expect(book?.tracks).toHaveLength(2);
  });

  it('returns null for books that are not live, unknown ids and ids that are not UUIDs', async () => {
    expect(await getPlayerBook(t.db, ids.draft!)).toBeNull();
    expect(await getPlayerBook(t.db, ids.deleted!)).toBeNull();
    expect(await getPlayerBook(t.db, '00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(await getPlayerBook(t.db, 'test-book')).toBeNull();
    expect(await getPlayerBook(t.db, "'; drop table books; --")).toBeNull();
  });
});
