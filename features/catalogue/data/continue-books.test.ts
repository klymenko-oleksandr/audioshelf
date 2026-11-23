import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOOK_IDS_PER_REQUEST,
  forgetContinueBooks,
  knownContinueBooks,
  loadContinueBooks,
} from './continue-books';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const book = (bookId: string) => ({ id: bookId, title: bookId, chapterStarts: [0] });

function fakeFetch(live: (bookId: string) => boolean = () => true) {
  return vi.fn(async (url: string | URL | Request) => {
    const asked = new URL(String(url), 'http://x').searchParams.get('ids')!.split(',');
    return new Response(JSON.stringify({ books: asked.filter(live).map(book) }));
  });
}

afterEach(() => forgetContinueBooks());

describe('loadContinueBooks', () => {
  it('asks in chunks the server accepts, so a big library is never cut off', async () => {
    const ids = Array.from({ length: BOOK_IDS_PER_REQUEST * 2 + 5 }, (_, n) => id(n));
    const fetcher = fakeFetch();
    await loadContinueBooks(ids, fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url] of fetcher.mock.calls) {
      expect(String(url).split('ids=')[1]!.split(',').length).toBeLessThanOrEqual(
        BOOK_IDS_PER_REQUEST,
      );
    }
    expect(knownContinueBooks(ids)?.size).toBe(ids.length);
  });

  it('remembers books that are gone, so they are not asked for again', async () => {
    const fetcher = fakeFetch((bookId) => bookId !== id(2));
    await loadContinueBooks([id(1), id(2)], fetcher as unknown as typeof fetch);
    expect([...knownContinueBooks([id(1), id(2)])!.keys()]).toEqual([id(1)]);

    await loadContinueBooks([id(1), id(2)], fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('asks again only for books it has not seen', async () => {
    const fetcher = fakeFetch();
    await loadContinueBooks([id(1)], fetcher as unknown as typeof fetch);
    await loadContinueBooks([id(1), id(2)], fetcher as unknown as typeof fetch);
    expect(String(fetcher.mock.calls[1]![0])).toContain(id(2));
    expect(String(fetcher.mock.calls[1]![0])).not.toContain(id(1));
  });

  it('fails as a whole when one chunk fails, and keeps nothing half-known', async () => {
    const ids = Array.from({ length: BOOK_IDS_PER_REQUEST + 1 }, (_, n) => id(n));
    let call = 0;
    const fetcher = vi.fn(async () =>
      ++call === 2
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify({ books: [] })),
    );
    await expect(loadContinueBooks(ids, fetcher as unknown as typeof fetch)).rejects.toThrow();
    expect(knownContinueBooks(ids)).toBeUndefined();
  });
});
