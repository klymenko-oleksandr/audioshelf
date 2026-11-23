// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { getAdminBooks } from '../data/books';
import { getBookForEdit } from '../data/book-form';
import { parseBooksQuery } from '../list-state';
import { softDeleteBook } from './data';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(schema.books);
});

async function book(title = 'Dracula', over: Partial<typeof schema.books.$inferInsert> = {}) {
  const [row] = await t.db
    .insert(schema.books)
    .values({ slug: `b-${Math.random().toString(36).slice(2)}`, title, ...over })
    .returning();
  await t.db.insert(schema.tracks).values({ bookId: row!.id, position: 1, r2Key: 'k' });
  await t.db
    .insert(schema.chapters)
    .values({ bookId: row!.id, position: 1, title: 'One', startSeconds: 0, endSeconds: 5 });
  return row!;
}
const reload = async (id: string) =>
  (await t.db.select().from(schema.books).where(eq(schema.books.id, id)))[0];

describe('softDeleteBook', () => {
  it('sets deleted_at and keeps the book, its tracks and chapters in the database', async () => {
    const { id } = await book('Dracula', { status: 'published', publishedAt: new Date() });
    const result = await softDeleteBook(t.db, id, 'dracula');
    expect(result).toEqual({ ok: true, title: 'Dracula' });
    const row = await reload(id);
    expect(row!.deletedAt).toBeInstanceOf(Date);
    expect(row!.status).toBe('published');
    expect(await t.db.select().from(schema.tracks)).toHaveLength(1);
    expect(await t.db.select().from(schema.chapters)).toHaveLength(1);
  });

  it('refuses when the typed title does not match, and changes nothing', async () => {
    const { id } = await book('Dracula');
    expect(await softDeleteBook(t.db, id, 'Drac')).toEqual({ ok: false, reason: 'mismatch' });
    expect((await reload(id))!.deletedAt).toBeNull();
  });

  it('compares with the stored title, not with anything the browser sent', async () => {
    const { id } = await book('Dracula');
    expect(await softDeleteBook(t.db, id, '')).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('does not find an unknown, malformed or already deleted book', async () => {
    const { id } = await book('Dracula', { deletedAt: new Date() });
    expect(await softDeleteBook(t.db, id, 'Dracula')).toEqual({ ok: false, reason: 'not_found' });
    expect(await softDeleteBook(t.db, '00000000-0000-4000-8000-000000000000', 'x')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await softDeleteBook(t.db, 'nope', 'x')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('keeps the deleted_at of a book that was already deleted', async () => {
    const earlier = new Date('2026-11-01T00:00:00Z');
    const { id } = await book('Dracula', { deletedAt: earlier });
    await softDeleteBook(t.db, id, 'Dracula');
    expect((await reload(id))!.deletedAt).toEqual(earlier);
  });

  it('removes the book from the admin list and the edit page', async () => {
    const { id } = await book('Dracula');
    await book('Other');
    await softDeleteBook(t.db, id, 'Dracula');
    const page = await getAdminBooks(t.db, parseBooksQuery({}));
    expect(page.rows.map((r) => r.title)).toEqual(['Other']);
    expect(await getBookForEdit(t.db, id)).toBeNull();
  });
});
