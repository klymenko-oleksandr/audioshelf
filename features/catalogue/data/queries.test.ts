// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { validateBook } from '@/features/player/core';
import { createTestDb } from '@/tests/test-db';
import { getBookBySlug, getPlayerBook, listNewReleases } from './queries';

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
  ids.author = author!.id;
  ids.category = category!.id;

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
}, 60_000);

afterAll(() => t.close());

describe('listNewReleases', () => {
  it('returns live books only, newest first', async () => {
    const books = await listNewReleases(t.db);
    expect(books.map((book) => book.slug)).toEqual(['newer', 'older', 'no-author']);
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
