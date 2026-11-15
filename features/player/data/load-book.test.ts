import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetLoadedBooks, loadPlayerBook } from './load-book';
import { TEST_BOOK } from './test-book';

const book = { ...TEST_BOOK, id: 'b1' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => forgetLoadedBooks());

describe('loadPlayerBook', () => {
  it('fetches a book once and remembers it', async () => {
    const fetcher = vi.fn(async () => json(book));
    expect(await loadPlayerBook('b1', fetcher)).toEqual(book);
    expect(await loadPlayerBook('b1', fetcher)).toEqual(book);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/player/books/b1');
  });

  it('shares one request between callers that ask at the same time', async () => {
    const fetcher = vi.fn(async () => json(book));
    await Promise.all([loadPlayerBook('b1', fetcher), loadPlayerBook('b1', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for a book that is gone', async () => {
    expect(await loadPlayerBook('gone', async () => json({ error: 'not_found' }, 404))).toBe(
      undefined,
    );
  });

  it('throws on a failure and tries again next time', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json(book));
    await expect(loadPlayerBook('b1', fetcher)).rejects.toThrow('offline');
    await expect(loadPlayerBook('b1', fetcher)).rejects.toThrow('500');
    expect(await loadPlayerBook('b1', fetcher)).toEqual(book);
  });

  it('knows the built-in test book without a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await loadPlayerBook(TEST_BOOK.id, fetcher)).toBe(TEST_BOOK);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
