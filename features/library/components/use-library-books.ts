'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { knownContinueBooks, loadContinueBooks } from '@/features/catalogue/data/continue-books';
import type { BookSummary } from '@/features/catalogue/data/queries';

export interface LibraryBooks {
  /** Every book the catalogue knows among `ids`. Ids it did not return are simply absent. */
  books: ReadonlyMap<string, BookSummary>;
  /** `loading` until every id has been asked for; `error` when a request failed. */
  status: 'loading' | 'ready' | 'error';
  retry(): void;
}

/**
 * Card data for the saved ids, from `GET /api/catalogue/books?ids=` (in chunks), kept in
 * memory for the tab. Books that were unpublished or deleted come back missing and are
 * skipped, so they never break the page or its counts.
 */
export function useLibraryBooks(ids: readonly string[]): LibraryBooks {
  const idsKey = ids.join(',');
  const list = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  // Bumped when a request settles (to read the cache) or when the listener retries.
  const [settled, setSettled] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const attemptKey = `${attempt}:${idsKey}`;

  const complete = knownContinueBooks(list) !== undefined;

  useEffect(() => {
    if (list.length === 0 || knownContinueBooks(list)) return;
    let cancelled = false;
    loadContinueBooks(list)
      .then(() => !cancelled && setSettled((n) => n + 1))
      .catch(() => !cancelled && setFailedFor(attemptKey));
    return () => {
      cancelled = true;
    };
  }, [list, attemptKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // `settled` is read so a finished request re-renders with the filled cache.
  const books = useMemo(() => {
    const found = new Map<string, BookSummary>();
    for (const id of list) {
      const book = knownContinueBooks([id])?.get(id);
      if (book) found.set(id, book);
    }
    return found;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, settled]);

  const status = complete ? 'ready' : failedFor === attemptKey ? 'error' : 'loading';
  return { books, status, retry };
}
