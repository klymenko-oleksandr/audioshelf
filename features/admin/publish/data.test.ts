// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { publishBook, unpublishBook } from './data';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
let author: string;
let narrator: string;
let category: string;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.db.delete(schema.books);
  await t.db.delete(schema.authors);
  await t.db.delete(schema.narrators);
  await t.db.delete(schema.categories);
  [{ id: author }] = (await t.db
    .insert(schema.authors)
    .values({ slug: 'a', name: 'A' })
    .returning({ id: schema.authors.id })) as [{ id: string }];
  [{ id: narrator }] = (await t.db
    .insert(schema.narrators)
    .values({ slug: 'n', name: 'N' })
    .returning({ id: schema.narrators.id })) as [{ id: string }];
  [{ id: category }] = (await t.db
    .insert(schema.categories)
    .values({ slug: 'c', nameUk: 'К' })
    .returning({ id: schema.categories.id })) as [{ id: string }];
});

async function book(
  over: Partial<typeof schema.books.$inferInsert> = {},
  trackStatuses: (typeof schema.tracks.$inferInsert)['status'][] = ['ready'],
) {
  const [row] = await t.db
    .insert(schema.books)
    .values({
      slug: `b-${Math.random().toString(36).slice(2)}`,
      title: 'Book',
      authorId: author,
      narratorId: narrator,
      categoryId: category,
      ...over,
    })
    .returning();
  for (const [i, status] of trackStatuses.entries()) {
    await t.db
      .insert(schema.tracks)
      .values({ bookId: row!.id, position: i + 1, r2Key: `k${i}`, status, durationSeconds: 5 });
  }
  return row!;
}
const reload = async (id: string) =>
  (await t.db.select().from(schema.books).where(eq(schema.books.id, id)))[0]!;

describe('publishBook', () => {
  it('publishes a complete draft and stamps the first publish date', async () => {
    const { id } = await book();
    const before = Date.now();
    const result = await publishBook(t.db, id);
    expect(result).toMatchObject({ ok: true });
    const row = await reload(id);
    expect(row.status).toBe('published');
    expect(row.publishedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('refuses a book with gaps, lists them all, and changes nothing', async () => {
    const { id } = await book({ authorId: null, categoryId: null, narratorId: null }, []);
    const result = await publishBook(t.db, id);
    expect(result).toEqual({
      ok: false,
      reason: 'incomplete',
      missing: ['author', 'category', 'narrator', 'ready-track'],
    });
    const row = await reload(id);
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
  });

  it('counts only ready tracks', async () => {
    const { id } = await book({}, ['uploading', 'processing', 'failed']);
    expect(await publishBook(t.db, id)).toMatchObject({ ok: false, missing: ['ready-track'] });
  });

  it('publishes with one ready track among others that are not ready', async () => {
    const { id } = await book({}, ['failed', 'ready']);
    expect(await publishBook(t.db, id)).toMatchObject({ ok: true });
  });

  it('keeps the first publish date when the book is unpublished and published again', async () => {
    const first = new Date('2026-10-01T10:00:00Z');
    const { id } = await book({ status: 'draft', publishedAt: first });
    await publishBook(t.db, id);
    expect((await reload(id)).publishedAt).toEqual(first);
  });

  it('refuses a book that is already published', async () => {
    const { id } = await book({ status: 'published', publishedAt: new Date() });
    expect(await publishBook(t.db, id)).toEqual({ ok: false, reason: 'wrong_state' });
  });

  it('publishes a scheduled book now and clears its schedule', async () => {
    const { id } = await book({ status: 'scheduled', publishAt: new Date('2027-01-01') });
    expect(await publishBook(t.db, id)).toMatchObject({ ok: true });
    const row = await reload(id);
    expect(row).toMatchObject({ status: 'published', publishAt: null });
  });

  it('does not find a deleted, unknown or malformed book', async () => {
    const { id } = await book({ deletedAt: new Date() });
    expect(await publishBook(t.db, id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await publishBook(t.db, '00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await publishBook(t.db, 'nope')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('unpublishBook', () => {
  it('sends a published book back to draft and keeps its publish date', async () => {
    const date = new Date('2026-10-01T10:00:00Z');
    const { id } = await book({ status: 'published', publishedAt: date });
    expect(await unpublishBook(t.db, id)).toMatchObject({ ok: true });
    const row = await reload(id);
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toEqual(date);
  });

  it('cancels a scheduled book and clears its schedule', async () => {
    const { id } = await book({ status: 'scheduled', publishAt: new Date('2027-01-01') });
    expect(await unpublishBook(t.db, id)).toMatchObject({ ok: true });
    expect(await reload(id)).toMatchObject({ status: 'draft', publishAt: null });
  });

  it('refuses a draft, and a book that does not exist', async () => {
    const { id } = await book();
    expect(await unpublishBook(t.db, id)).toEqual({ ok: false, reason: 'wrong_state' });
    expect(await unpublishBook(t.db, 'nope')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('does not touch a deleted book', async () => {
    const { id } = await book({ status: 'published', deletedAt: new Date() });
    expect(await unpublishBook(t.db, id)).toEqual({ ok: false, reason: 'not_found' });
  });
});
