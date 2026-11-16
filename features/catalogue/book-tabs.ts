/** The book page's tabs that have content (Reviews arrives in v1.1). Shared by server and client. */
export const BOOK_TABS = ['chapters', 'about'] as const;
export type BookTab = (typeof BOOK_TABS)[number];

/** `?tab=` from the URL; anything unknown is the default tab. */
export const parseBookTab = (value: string | string[] | undefined): BookTab =>
  value === 'about' ? 'about' : 'chapters';
