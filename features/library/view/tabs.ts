import type { BookSummary } from '@/features/catalogue/data/queries';
import type { HistoryRecord } from '@/lib/local-db/types';

/** Library → Liked · Listen later · History (PRD). The tab and sort live in the URL. */
export const LIBRARY_TABS = ['liked', 'listenLater', 'history'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];
/** "See all" on Home's Continue listening lands here. */
export const DEFAULT_LIBRARY_TAB: LibraryTab = 'history';

export type LibrarySort = 'added' | 'played' | 'title' | 'author';

const SORTS: Record<LibraryTab, readonly LibrarySort[]> = {
  liked: ['added', 'title', 'author'],
  listenLater: ['added', 'title', 'author'],
  history: ['played', 'title', 'author'],
};

export const sortsFor = (tab: LibraryTab): readonly LibrarySort[] => SORTS[tab];
export const defaultSort = (tab: LibraryTab): LibrarySort => SORTS[tab][0]!;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseLibraryTab(value: string | string[] | undefined): LibraryTab {
  const tab = first(value);
  return (LIBRARY_TABS as readonly string[]).includes(tab ?? '')
    ? (tab as LibraryTab)
    : DEFAULT_LIBRARY_TAB;
}

/** A sort this tab offers, or the tab's default ("played" means nothing for Liked). */
export function parseLibrarySort(
  tab: LibraryTab,
  value: string | string[] | undefined,
): LibrarySort {
  const sort = first(value);
  return (SORTS[tab] as readonly string[]).includes(sort ?? '')
    ? (sort as LibrarySort)
    : defaultSort(tab);
}

/** The page's URL; defaults are left out so the plain link stays clean. */
export function libraryHref(tab: LibraryTab, sort: LibrarySort): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_LIBRARY_TAB) params.set('tab', tab);
  if (sort !== defaultSort(tab)) params.set('sort', sort);
  const query = params.toString();
  return query ? `/library?${query}` : '/library';
}

export interface LibraryEntry {
  book: BookSummary;
  /** When it was liked / queued, or last played (History). */
  at: number;
  /** History only: the book was listened to the end. */
  finished: boolean;
}

// Ukrainian rules: Cyrillic first, then Latin; numbers by value (same as the catalogue lists).
const collator = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });

function sortEntries(entries: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const newest = (a: LibraryEntry, b: LibraryEntry) => b.at - a.at;
  return entries.sort((a, b) => {
    if (sort === 'title') return collator.compare(a.book.title, b.book.title) || newest(a, b);
    if (sort === 'author') {
      const x = a.book.author?.name;
      const y = b.book.author?.name;
      if (x === undefined || y === undefined) {
        return x === y ? newest(a, b) : x === undefined ? 1 : -1; // no author: last
      }
      return collator.compare(x, y) || newest(a, b);
    }
    return newest(a, b); // added, played
  });
}

export interface LibraryViewInput {
  likedAt: ReadonlyMap<string, number>;
  listenLaterAt: ReadonlyMap<string, number>;
  history: readonly HistoryRecord[];
  /** What the catalogue returned. Ids missing here (unpublished, deleted, unknown) are skipped. */
  books: ReadonlyMap<string, BookSummary>;
  sorts: Record<LibraryTab, LibrarySort>;
}

/** The three tabs' books, sorted. A tab's count is its length: only books that can be shown. */
export function buildLibraryView(input: LibraryViewInput): Record<LibraryTab, LibraryEntry[]> {
  const resolve = (rows: Iterable<[string, number, boolean]>) => {
    const entries: LibraryEntry[] = [];
    for (const [id, at, finished] of rows) {
      const book = input.books.get(id);
      if (book) entries.push({ book, at, finished });
    }
    return entries;
  };
  const flagged = (map: ReadonlyMap<string, number>) =>
    resolve([...map].map(([id, at]): [string, number, boolean] => [id, at, false]));

  return {
    liked: sortEntries(flagged(input.likedAt), input.sorts.liked),
    listenLater: sortEntries(flagged(input.listenLaterAt), input.sorts.listenLater),
    history: sortEntries(
      resolve(
        input.history.map((h): [string, number, boolean] => [
          h.bookId,
          h.lastPlayedAt,
          h.finishedAt !== undefined,
        ]),
      ),
      input.sorts.history,
    ),
  };
}
