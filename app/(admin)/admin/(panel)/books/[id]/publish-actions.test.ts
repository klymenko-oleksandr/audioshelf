// @vitest-environment node
import { eq } from 'drizzle-orm';
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

import { deleteBookAction, publishBookAction, unpublishBookAction } from './publish-actions';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
let bookId: string;
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
  await t.db.delete(schema.authors);
  await t.db.delete(schema.narrators);
  await t.db.delete(schema.categories);
  const [a] = await t.db.insert(schema.authors).values({ slug: 'a', name: 'A' }).returning();
  const [n] = await t.db.insert(schema.narrators).values({ slug: 'n', name: 'N' }).returning();
  const [c] = await t.db.insert(schema.categories).values({ slug: 'c', nameUk: 'К' }).returning();
  const [book] = await t.db
    .insert(schema.books)
    .values({
      slug: 'dracula',
      title: 'Dracula',
      authorId: a!.id,
      narratorId: n!.id,
      categoryId: c!.id,
    })
    .returning();
  bookId = book!.id;
  await t.db.insert(schema.tracks).values({
    bookId,
    position: 1,
    r2Key: 'k',
    status: 'ready',
    durationSeconds: 5,
  });
});

const row = async () =>
  (await t.db.select().from(schema.books).where(eq(schema.books.id, bookId)))[0]!;

describe('every action checks the admin session first', () => {
  beforeEach(() => mocks.getAdminSession.mockResolvedValue(null));

  it.each([
    ['publish', () => publishBookAction(bookId)],
    ['unpublish', () => unpublishBookAction(bookId)],
    ['delete', () => deleteBookAction(bookId, 'Dracula')],
  ])('%s refuses without a session and changes nothing', async (_name, run) => {
    const result = await run();
    expect(result).toMatchObject({ ok: false });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
    expect(await row()).toMatchObject({ status: 'draft', deletedAt: null });
  });
});

describe('publishBookAction', () => {
  it('publishes and refreshes the catalogue', async () => {
    expect(await publishBookAction(bookId)).toEqual({ ok: true });
    expect((await row()).status).toBe('published');
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('says what is missing and does not refresh when the book is incomplete', async () => {
    await t.db.update(schema.books).set({ narratorId: null, authorId: null });
    const result = await publishBookAction(bookId);
    expect(result).toEqual({
      ok: false,
      message: 'Missing: author, narrator',
      missing: ['author', 'narrator'],
    });
    expect((await row()).status).toBe('draft');
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('explains an unknown book and one that is already published', async () => {
    expect(await publishBookAction(GONE)).toMatchObject({
      ok: false,
      message: 'This book no longer exists.',
    });
    await publishBookAction(bookId);
    expect(await publishBookAction(bookId)).toMatchObject({
      ok: false,
      message: 'This book is already published.',
    });
  });

  it('answers cleanly when the database fails', async () => {
    mocks.getDb.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await publishBookAction(bookId)).toEqual({
      ok: false,
      message: 'Something went wrong. Nothing was changed. Try again in a moment.',
    });
  });
});

describe('unpublishBookAction', () => {
  it('sends the book back to draft and refreshes the catalogue', async () => {
    await publishBookAction(bookId);
    mocks.revalidateCatalogue.mockClear();
    expect(await unpublishBookAction(bookId)).toEqual({ ok: true });
    expect((await row()).status).toBe('draft');
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('refuses a draft', async () => {
    expect(await unpublishBookAction(bookId)).toMatchObject({
      ok: false,
      message: 'This book is already a draft.',
    });
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });
});

describe('deleteBookAction', () => {
  it('soft-deletes with the right title and refreshes the catalogue', async () => {
    expect(await deleteBookAction(bookId, 'dracula')).toEqual({ ok: true });
    expect((await row()).deletedAt).toBeInstanceOf(Date);
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('refuses a wrong title', async () => {
    expect(await deleteBookAction(bookId, 'Dracul')).toEqual({
      ok: false,
      message: 'The title you typed does not match.',
      mismatch: true,
    });
    expect((await row()).deletedAt).toBeNull();
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('explains a book that is already gone', async () => {
    await deleteBookAction(bookId, 'Dracula');
    expect(await deleteBookAction(bookId, 'Dracula')).toMatchObject({
      ok: false,
      message: 'This book no longer exists.',
    });
  });
});
