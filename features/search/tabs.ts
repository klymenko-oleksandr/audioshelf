/** The tabs of the search results page (`?tab=`). Shared by server and client code. */
export const SEARCH_TABS = ['all', 'books', 'authors', 'narrators'] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

export function parseSearchTab(value: string | string[] | undefined): SearchTab {
  const first = Array.isArray(value) ? value[0] : value;
  return SEARCH_TABS.find((tab) => tab === first) ?? 'all';
}

/** The longest query the page uses; longer ones are cut. */
export const MAX_QUERY_LENGTH = 100;

export function parseQuery(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

export const searchHref = (query: string, tab: SearchTab = 'all') => {
  const params = new URLSearchParams({ q: query });
  if (tab !== 'all') params.set('tab', tab);
  return `/search?${params}`;
};
