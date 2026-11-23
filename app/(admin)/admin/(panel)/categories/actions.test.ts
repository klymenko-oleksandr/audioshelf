// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getDb: vi.fn(),
  revalidateCatalogue: vi.fn(),
}));

vi.mock('@/lib/auth/admin/guard', () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/features/admin/revalidate', () => ({ revalidateCatalogue: mocks.revalidateCatalogue }));

import { createCategoryAction, deleteCategoryAction, renameCategoryAction } from './actions';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
const GONE = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.getAdminSession.mockResolvedValue({ adminId: 'owner' });
  mocks.getDb.mockReturnValue(t.db);
  await t.db.delete(schema.books);
  await t.db.delete(schema.categories);
});

const make = async (nameUk: string) => {
  const result = await createCategoryAction({ nameUk, nameEn: '' });
  if (!result.ok) throw new Error(JSON.stringify(result));
  mocks.revalidateCatalogue.mockClear();
  return result.categories.find((c) => c.nameUk === nameUk)!;
};

describe('every action checks the admin session first', () => {
  beforeEach(() => mocks.getAdminSession.mockResolvedValue(null));

  it.each([
    ['create', () => createCategoryAction({ nameUk: 'X', nameEn: '' })],
    ['rename', () => renameCategoryAction(GONE, { nameUk: 'X', nameEn: '' })],
    ['delete', () => deleteCategoryAction(GONE)],
  ])('%s refuses without a session and touches nothing', async (_name, run) => {
    expect(await run()).toMatchObject({ ok: false });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
    expect(await t.db.select().from(schema.categories)).toHaveLength(0);
  });
});

describe('createCategoryAction', () => {
  it('creates, returns the fresh list and refreshes the catalogue', async () => {
    const result = await createCategoryAction({ nameUk: ' Поезія ', nameEn: 'Poetry' });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.categories.map((c) => c.nameEn)).toEqual(['Poetry']);
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('returns a message per field and does not refresh when the input is wrong', async () => {
    expect(await createCategoryAction({ nameUk: '', nameEn: '' })).toEqual({
      ok: false,
      errors: { nameUk: 'Enter the name in Ukrainian.' },
    });
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('refuses a duplicate name', async () => {
    await make('Поезія');
    expect(await createCategoryAction({ nameUk: 'поезія', nameEn: '' })).toEqual({
      ok: false,
      errors: { nameUk: 'A category with this name already exists.' },
    });
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('answers cleanly when the database fails', async () => {
    mocks.getDb.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await createCategoryAction({ nameUk: 'X', nameEn: '' })).toEqual({
      ok: false,
      message: 'Something went wrong. Nothing was changed. Try again in a moment.',
    });
  });
});

describe('renameCategoryAction', () => {
  it('renames and refreshes the catalogue', async () => {
    const { id } = await make('Поезія');
    const result = await renameCategoryAction(id, { nameUk: 'Вірші', nameEn: 'Verse' });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.categories[0]).toMatchObject({ nameUk: 'Вірші', nameEn: 'Verse' });
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('needs the Ukrainian name and explains an unknown category', async () => {
    const { id } = await make('Поезія');
    expect(await renameCategoryAction(id, { nameUk: '  ', nameEn: 'x' })).toMatchObject({
      ok: false,
      errors: { nameUk: 'Enter the name in Ukrainian.' },
    });
    expect(await renameCategoryAction(GONE, { nameUk: 'X', nameEn: '' })).toEqual({
      ok: false,
      message: 'This category no longer exists. Reload the page.',
    });
  });
});

describe('deleteCategoryAction', () => {
  it('deletes an unused category and refreshes the catalogue', async () => {
    const { id } = await make('Поезія');
    const result = await deleteCategoryAction(id);
    expect(result).toEqual({ ok: true, categories: [] });
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('refuses a category in use, saying how many books', async () => {
    const { id } = await make('Поезія');
    await t.db.insert(schema.books).values({ slug: 'b', title: 'B', categoryId: id });
    expect(await deleteCategoryAction(id)).toEqual({
      ok: false,
      message: 'Used by 1 book. Move it to another category first.',
    });
    expect(await t.db.select().from(schema.categories)).toHaveLength(1);
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('explains an unknown category', async () => {
    expect(await deleteCategoryAction(GONE)).toEqual({
      ok: false,
      message: 'This category no longer exists. Reload the page.',
    });
  });
});
