// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { createCategory, deleteCategory, listAdminCategories, renameCategory } from './data';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());
beforeEach(async () => {
  await t.db.delete(schema.books);
  await t.db.delete(schema.categories);
});

const input = (nameUk: string, nameEn: string | null = null) => ({ nameUk, nameEn });
async function make(nameUk: string, nameEn: string | null = null) {
  const result = await createCategory(t.db, input(nameUk, nameEn));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.category;
}
const addBook = (categoryId: string, over: Partial<typeof schema.books.$inferInsert> = {}) =>
  t.db
    .insert(schema.books)
    .values({ slug: `b-${Math.random().toString(36).slice(2)}`, title: 'B', categoryId, ...over });

describe('createCategory', () => {
  it('creates a category with a slug from the Ukrainian name and goes to the end', async () => {
    const first = await make('Художня', 'Fiction');
    const second = await make('Поезія');
    expect(first).toMatchObject({ slug: 'khudozhnia', nameUk: 'Художня', nameEn: 'Fiction' });
    expect(second.nameEn).toBeNull();
    expect(second.position).toBeGreaterThan(first.position);
  });

  it('gives a second category with the same slug a number', async () => {
    await make('Поезія');
    const other = await make('Поезія!');
    expect(other.slug).toBe('poeziia-2');
  });

  it('refuses a name that already exists, ignoring case and spacing', async () => {
    await make('Художня');
    expect(await createCategory(t.db, input('  худОжня '))).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { nameUk: 'A category with this name already exists.' },
    });
    expect(await t.db.select().from(schema.categories)).toHaveLength(1);
  });

  it('refuses an English name that already exists too', async () => {
    await make('Художня', 'Fiction');
    expect(await createCategory(t.db, input('Інша', 'fiction'))).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { nameEn: 'A category with this name already exists.' },
    });
  });
});

describe('renameCategory', () => {
  it('changes the names and keeps the slug, so listener links keep working', async () => {
    const { id, slug } = await make('Художня');
    const result = await renameCategory(t.db, id, input('Проза', 'Prose'));
    expect(result).toMatchObject({ ok: true });
    const [row] = await t.db.select().from(schema.categories).where(eq(schema.categories.id, id));
    expect(row).toMatchObject({ slug, nameUk: 'Проза', nameEn: 'Prose' });
  });

  it('lets a category keep or clear its own names', async () => {
    const { id } = await make('Художня', 'Fiction');
    expect(await renameCategory(t.db, id, input('Художня', null))).toMatchObject({ ok: true });
  });

  it('refuses a name another category has', async () => {
    await make('Поезія');
    const { id } = await make('Художня');
    expect(await renameCategory(t.db, id, input('поезія'))).toMatchObject({
      ok: false,
      reason: 'invalid',
      errors: { nameUk: 'A category with this name already exists.' },
    });
  });

  it('does not find an unknown or malformed category', async () => {
    expect(await renameCategory(t.db, '00000000-0000-4000-8000-000000000000', input('X'))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await renameCategory(t.db, 'nope', input('X'))).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('deleteCategory', () => {
  it('deletes a category no book uses', async () => {
    const { id } = await make('Художня');
    expect(await deleteCategory(t.db, id)).toEqual({ ok: true });
    expect(await t.db.select().from(schema.categories)).toHaveLength(0);
  });

  it('refuses a category that books use, and says how many', async () => {
    const { id } = await make('Художня');
    await addBook(id);
    await addBook(id);
    expect(await deleteCategory(t.db, id)).toEqual({
      ok: false,
      reason: 'in_use',
      liveBooks: 2,
      deletedBooks: 0,
    });
    expect(await t.db.select().from(schema.categories)).toHaveLength(1);
  });

  it('counts a deleted book as using the category', async () => {
    const { id } = await make('Художня');
    await addBook(id, { deletedAt: new Date() });
    expect(await deleteCategory(t.db, id)).toEqual({
      ok: false,
      reason: 'in_use',
      liveBooks: 0,
      deletedBooks: 1,
    });
  });

  it('does not find an unknown category', async () => {
    expect(await deleteCategory(t.db, '00000000-0000-4000-8000-000000000000')).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('listAdminCategories', () => {
  it('lists categories in order with live and deleted book counts', async () => {
    const a = await make('Художня', 'Fiction');
    const b = await make('Поезія');
    await addBook(a.id, { status: 'published' });
    await addBook(a.id);
    await addBook(a.id, { deletedAt: new Date() });
    const list = await listAdminCategories(t.db);
    expect(list.map((c) => [c.nameUk, c.liveBooks, c.deletedBooks])).toEqual([
      ['Художня', 2, 1],
      ['Поезія', 0, 0],
    ]);
    expect(list[1]!.id).toBe(b.id);
    expect(list[0]!.updatedAt).toBeInstanceOf(Date);
  });
});
