import { asc, eq, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { attentionNote, findAttention, type AttentionReason, type BookStatus } from '../attention';
import { safeSearchText, type BooksQuery, type BookTab } from '../list-state';

export type AdminDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const { books, authors, narrators, categories, tracks } = schema;

/** The list is not paged yet; it reads up to this many books. Revisit when the catalogue grows. */
export const ADMIN_LIST_LIMIT = 1000;

export interface AdminBookRow {
  id: string;
  slug: string;
  title: string;
  status: BookStatus;
  author: string | null;
  narrator: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  ongoing: boolean;
  trackCount: number;
  durationSeconds: number;
  publishAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  attention: AttentionReason[];
  /** One line for the list row ("Track 4 failed"); empty when nothing needs attention. */
  attentionNote: string;
}

export interface AdminBooksTotals {
  books: number;
  published: number;
  scheduled: number;
  drafts: number;
  attention: number;
  seconds: number;
  nextScheduledAt: Date | null;
}

export interface AdminBooksPage {
  rows: AdminBookRow[];
  /** Tab counts for the current search and category. */
  counts: Record<BookTab, number>;
  /** Figures for the cards at the top: every live book, whatever is searched or filtered. */
  totals: AdminBooksTotals;
  /** For the category filter. */
  categories: { slug: string; name: string }[];
}

const collator = new Intl.Collator('uk');

/**
 * Everything the admin books list shows, in one read. The catalogue is small (a few hundred
 * books at most), so books and tracks are read whole and the searching, counting and sorting
 * happen here: the tab counts, the cards and the table then always agree with each other.
 */
export async function getAdminBooks(db: AdminDb, query: BooksQuery): Promise<AdminBooksPage> {
  const [bookRows, trackRows, categoryRows] = await Promise.all([
    db
      .select({
        id: books.id,
        slug: books.slug,
        title: books.title,
        status: books.status,
        ongoing: books.ongoing,
        authorId: books.authorId,
        categoryId: books.categoryId,
        coverKey: books.coverLargeKey,
        durationSeconds: books.durationSeconds,
        publishAt: books.publishAt,
        publishedAt: books.publishedAt,
        updatedAt: books.updatedAt,
        authorName: authors.name,
        narratorName: narrators.name,
        categorySlug: categories.slug,
        categoryNameUk: categories.nameUk,
        categoryNameEn: categories.nameEn,
      })
      .from(books)
      .leftJoin(authors, eq(authors.id, books.authorId))
      .leftJoin(narrators, eq(narrators.id, books.narratorId))
      .leftJoin(categories, eq(categories.id, books.categoryId))
      .where(isNull(books.deletedAt))
      .limit(ADMIN_LIST_LIMIT),
    db
      .select({ bookId: tracks.bookId, position: tracks.position, status: tracks.status })
      .from(tracks)
      .innerJoin(books, eq(books.id, tracks.bookId))
      .where(isNull(books.deletedAt))
      .orderBy(asc(tracks.position)),
    db
      .select({
        slug: categories.slug,
        nameUk: categories.nameUk,
        nameEn: categories.nameEn,
      })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.slug)),
  ]);

  const tracksByBook = new Map<string, { position: number; status: string }[]>();
  for (const track of trackRows) {
    const list = tracksByBook.get(track.bookId) ?? [];
    list.push(track);
    tracksByBook.set(track.bookId, list);
  }

  const all: AdminBookRow[] = bookRows.map((book) => {
    const bookTracks = tracksByBook.get(book.id) ?? [];
    const attention = findAttention({
      status: book.status,
      hasAuthor: book.authorId !== null,
      hasCategory: book.categoryId !== null,
      hasCover: !!book.coverKey,
      readyTracks: bookTracks.filter((t) => t.status === 'ready').length,
      failedTrackPositions: bookTracks.filter((t) => t.status === 'failed').map((t) => t.position),
    });
    return {
      id: book.id,
      slug: book.slug,
      title: book.title,
      status: book.status,
      author: book.authorName,
      narrator: book.narratorName,
      categorySlug: book.categorySlug,
      categoryName: book.categoryNameEn ?? book.categoryNameUk,
      ongoing: book.ongoing,
      trackCount: bookTracks.length,
      durationSeconds: book.durationSeconds,
      publishAt: book.publishAt,
      publishedAt: book.publishedAt,
      updatedAt: book.updatedAt,
      attention,
      attentionNote: attentionNote(attention),
    };
  });

  const scheduled = all
    .filter((b) => b.status === 'scheduled' && b.publishAt)
    .map((b) => b.publishAt!.getTime());
  const totals: AdminBooksTotals = {
    books: all.length,
    published: all.filter((b) => b.status === 'published').length,
    scheduled: all.filter((b) => b.status === 'scheduled').length,
    drafts: all.filter((b) => b.status === 'draft').length,
    attention: all.filter((b) => b.attention.length > 0).length,
    seconds: all.reduce((sum, b) => sum + b.durationSeconds, 0),
    nextScheduledAt: scheduled.length > 0 ? new Date(Math.min(...scheduled)) : null,
  };

  const needle = safeSearchText(query.q);
  const matching = all.filter(
    (b) =>
      (!query.category || b.categorySlug === query.category) &&
      (!needle ||
        [b.title, b.author, b.narrator].some((v) => v && safeSearchText(v).includes(needle))),
  );

  const counts: Record<BookTab, number> = {
    all: matching.length,
    published: matching.filter((b) => b.status === 'published').length,
    scheduled: matching.filter((b) => b.status === 'scheduled').length,
    draft: matching.filter((b) => b.status === 'draft').length,
    attention: matching.filter((b) => b.attention.length > 0).length,
  };

  const inTab = matching.filter((b) => {
    switch (query.tab) {
      case 'all':
        return true;
      case 'attention':
        return b.attention.length > 0;
      default:
        return b.status === query.tab;
    }
  });
  const rows = inTab.sort(
    query.sort === 'title'
      ? (a, b) => collator.compare(a.title, b.title)
      : (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  return {
    rows,
    counts,
    totals,
    categories: categoryRows.map((c) => ({ slug: c.slug, name: c.nameEn ?? c.nameUk })),
  };
}
