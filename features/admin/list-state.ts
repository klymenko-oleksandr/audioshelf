/** The books list keeps its state in the URL, so a filtered view can be reloaded or shared. */
export const BOOK_TABS = ['all', 'published', 'scheduled', 'draft', 'attention'] as const;
export type BookTab = (typeof BOOK_TABS)[number];

export const BOOK_SORTS = ['updated', 'title'] as const;
export type BookSort = (typeof BOOK_SORTS)[number];
export const DEFAULT_SORT: BookSort = 'updated';

export interface BooksQuery {
  tab: BookTab;
  q: string;
  /** Category slug, or '' for all. */
  category: string;
  sort: BookSort;
}

const MAX_QUERY_LENGTH = 100;
type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? '';

export function parseBooksQuery(raw: Raw): BooksQuery {
  const tab = first(raw.tab);
  const sort = first(raw.sort);
  return {
    tab: (BOOK_TABS as readonly string[]).includes(tab) ? (tab as BookTab) : 'all',
    q: first(raw.q).trim().slice(0, MAX_QUERY_LENGTH),
    category: first(raw.category).trim().slice(0, MAX_QUERY_LENGTH),
    sort: (BOOK_SORTS as readonly string[]).includes(sort) ? (sort as BookSort) : DEFAULT_SORT,
  };
}

export function buildBooksHref(current: BooksQuery, change: Partial<BooksQuery> = {}): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.tab !== 'all') params.set('tab', next.tab);
  if (next.q) params.set('q', next.q);
  if (next.category) params.set('category', next.category);
  if (next.sort !== DEFAULT_SORT) params.set('sort', next.sort);
  const query = params.toString();
  return query ? `/admin/books?${query}` : '/admin/books';
}

/** Lower case with accents removed, for matching what an admin types against titles and names. */
export function safeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
