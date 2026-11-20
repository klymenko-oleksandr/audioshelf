// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSession = vi.fn();
const saveBook = vi.fn();
const revalidateCatalogue = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});

vi.mock('@/lib/auth/admin/guard', () => ({ getAdminSession }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/features/admin/data/book-form', () => ({ saveBook }));
vi.mock('@/features/admin/revalidate', () => ({ revalidateCatalogue }));
vi.mock('next/navigation', () => ({ redirect }));

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};
const IDLE = { status: 'idle' } as const;
const BOOK = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const saved = { ok: true, id: BOOK, slug: 'a-book', updatedAt: new Date('2026-11-20T19:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSession.mockResolvedValue({ adminId: 'owner' });
  saveBook.mockResolvedValue(saved);
});

async function run(bookId: string | null, entries: Record<string, string>) {
  const { saveBookAction } = await import('./actions');
  return saveBookAction(bookId, IDLE, form(entries));
}

describe('saveBookAction', () => {
  it('refuses without an admin session and touches nothing', async () => {
    getAdminSession.mockResolvedValue(null);
    const result = await run(null, { title: 'T' });
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('session') });
    expect(saveBook).not.toHaveBeenCalled();
    expect(revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('returns the field errors of an invalid form without saving or revalidating', async () => {
    const result = await run(null, { title: ' ' });
    expect(result).toEqual({ status: 'error', errors: { title: 'Enter a title.' } });
    expect(saveBook).not.toHaveBeenCalled();
    expect(revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('after saving an existing book, revalidates the catalogue and reports what was saved', async () => {
    const result = await run(BOOK, { title: 'T' });
    expect(saveBook).toHaveBeenCalledWith({}, BOOK, expect.objectContaining({ title: 'T' }));
    expect(revalidateCatalogue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'saved',
      savedAt: '2026-11-20T19:00:00.000Z',
      submitted: { title: 'T' },
    });
  });

  it('after creating a book, revalidates and then goes to its edit page', async () => {
    await expect(run(null, { title: 'T' })).rejects.toThrow(
      `NEXT_REDIRECT /admin/books/${BOOK}?created=1`,
    );
    expect(revalidateCatalogue).toHaveBeenCalledTimes(1);
    expect(revalidate_before_redirect()).toBe(true);
  });

  it('passes the data layer’s field errors on and does not revalidate', async () => {
    saveBook.mockResolvedValue({
      ok: false,
      reason: 'invalid',
      errors: {
        newAuthorName: 'An author with this name already exists. Pick them from the list.',
      },
    });
    expect(await run(BOOK, { title: 'T' })).toEqual({
      status: 'error',
      errors: {
        newAuthorName: 'An author with this name already exists. Pick them from the list.',
      },
    });
    expect(revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('says so when the book was deleted meanwhile', async () => {
    saveBook.mockResolvedValue({ ok: false, reason: 'not_found' });
    expect(await run(BOOK, { title: 'T' })).toMatchObject({
      status: 'error',
      message: 'This book no longer exists.',
    });
    expect(revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('keeps the form and reports a database failure without leaking its message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveBook.mockRejectedValue(new Error('connection refused to db.internal:5432'));
    const result = await run(BOOK, { title: 'T' });
    expect(result).toMatchObject({ status: 'error', errors: {} });
    expect(JSON.stringify(result)).not.toContain('db.internal');
    expect(revalidateCatalogue).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

/** The redirect throws, so the revalidation must already have happened by then. */
function revalidate_before_redirect() {
  return revalidateCatalogue.mock.invocationCallOrder[0]! < redirect.mock.invocationCallOrder[0]!;
}
