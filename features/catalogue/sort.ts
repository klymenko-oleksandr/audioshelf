import type { BookSummary } from './data/queries';

/**
 * Sort orders for book lists (Explore, Category, Author), kept in the URL as `?sort=`.
 * "Most popular" from the canvas needs play counts (Phase 6); newest is the default until then.
 */
export const BOOK_SORTS = ['newest', 'length', 'title'] as const;
export type BookSort = (typeof BOOK_SORTS)[number];
export const DEFAULT_BOOK_SORT: BookSort = 'newest';

/** Reads `?sort=`; anything unknown falls back to the default. */
export function parseBookSort(value: string | string[] | undefined): BookSort {
  const first = Array.isArray(value) ? value[0] : value;
  return (BOOK_SORTS as readonly string[]).includes(first ?? '')
    ? (first as BookSort)
    : DEFAULT_BOOK_SORT;
}

/** The page's URL for a sort; the default leaves the URL clean. */
export function sortHref(pathname: string, sort: BookSort): string {
  return sort === DEFAULT_BOOK_SORT ? pathname : `${pathname}?sort=${sort}`;
}

// Ukrainian rules: Cyrillic titles first, then Latin ones; numbers in titles sort by value.
const byTitle = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });

/**
 * Sorts a list that arrives newest first (as the queries return it):
 * - `newest` keeps that order;
 * - `length` puts the shortest first;
 * - `title` is alphabetical (done here, not in SQL, so Ukrainian letters sort the same way
 *   whatever the database collation is).
 * Ties keep the newest-first order.
 */
export function sortBooks<T extends Pick<BookSummary, 'title' | 'durationSeconds'>>(
  books: readonly T[],
  sort: BookSort,
): T[] {
  const sorted = [...books];
  if (sort === 'length') sorted.sort((a, b) => a.durationSeconds - b.durationSeconds);
  if (sort === 'title') sorted.sort((a, b) => byTitle.compare(a.title, b.title));
  return sorted;
}
