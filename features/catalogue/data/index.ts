import 'server-only';

import { unstable_cache } from 'next/cache';
import { getDb } from '@/lib/db';
import * as queries from './queries';

export type {
  BookChapter,
  BookDetail,
  BookSummary,
  CategoryRef,
  CategoryRow,
  ContinueBook,
  PersonRef,
} from './queries';
export { MAX_BOOK_IDS } from './queries';

/**
 * Cached catalogue reads for pages and route handlers (ADR 6: the data is cached, not the
 * page, because the language cookie makes every page render per request).
 *
 * Everything carries the `catalogue` tag; the admin revalidates it on every change
 * (Phase 4). Until then the time limit below is what picks up changes made directly in the
 * database.
 */
export const CATALOGUE_TAG = 'catalogue';
const REVALIDATE_SECONDS = 300;

const cached = <Args extends unknown[], Result>(
  name: string,
  fn: (db: queries.CatalogueDb, ...args: Args) => Promise<Result>,
) =>
  unstable_cache((...args: Args) => fn(getDb(), ...args), ['catalogue', name], {
    tags: [CATALOGUE_TAG],
    revalidate: REVALIDATE_SECONDS,
  });

export const listNewReleases = cached('new-releases', queries.listNewReleases);
export const listCategoryRows = cached('category-rows', queries.listCategoryRows);
export const listBooksByIds = cached('books-by-ids', queries.listBooksByIds);
export const getBookBySlug = cached('book-by-slug', queries.getBookBySlug);
export const getPlayerBook = cached('player-book', queries.getPlayerBook);
