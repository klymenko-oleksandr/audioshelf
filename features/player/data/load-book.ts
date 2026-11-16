import type { PlayerBook } from '../core';
import { TEST_BOOK } from './test-book';

/**
 * Loads what the player needs for a book (tracks, chapters) from the server. Cards and
 * pages only carry a summary; this runs when Play is pressed and when the last book is
 * restored on app open.
 *
 * Kept in memory for the life of the tab, so pressing Play twice costs one request.
 * `undefined` means the book is gone (unpublished or deleted); a network failure throws.
 */
const loaded = new Map<string, Promise<PlayerBook | undefined>>([
  [TEST_BOOK.id, Promise.resolve(TEST_BOOK)],
]);

export function loadPlayerBook(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<PlayerBook | undefined> {
  const known = loaded.get(id);
  if (known) return known;

  const request = (async () => {
    const response = await fetcher(`/api/player/books/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Loading book ${id} failed: ${response.status}`);
    return (await response.json()) as PlayerBook;
  })();
  loaded.set(id, request);
  // A failed load must not be remembered: the next Play tries again.
  request.catch(() => loaded.delete(id));
  return request;
}

/** For tests. */
export function forgetLoadedBooks(): void {
  loaded.clear();
  loaded.set(TEST_BOOK.id, Promise.resolve(TEST_BOOK));
}
