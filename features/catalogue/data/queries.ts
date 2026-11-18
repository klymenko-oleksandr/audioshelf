import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import type { PlayerBook } from '@/features/player/core';
import { publicUrl } from '@/lib/r2/keys';

/**
 * Catalogue read queries. Every function takes the database, so the same code runs against
 * production (through `./index.ts`, cached) and against the in-memory test database.
 *
 * The listener app only ever sees live books: published and not deleted.
 */
export type CatalogueDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const { books, tracks, chapters, categories, authors } = schema;
const live = and(eq(books.status, 'published'), isNull(books.deletedAt));

/** The dev-URL fallback keeps local runs and tests working without an .env file. */
const mediaBase = () =>
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://pub-7ddca733a83f439db26bf0870cfe3f84.r2.dev';
const media = (key: string | null): string | undefined =>
  key ? publicUrl(key, mediaBase()) : undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PersonRef {
  slug: string;
  name: string;
}

/** What a book card needs. No tracks: the player loads those when Play is pressed. */
export interface BookSummary {
  id: string;
  slug: string;
  title: string;
  author: PersonRef | null;
  /** 500 px cover. */
  coverUrl?: string;
  durationSeconds: number;
  language: string;
  ongoing: boolean;
}

/** A book in "Continue listening": the card also says which chapter the listener is in. */
export interface ContinueBook extends BookSummary {
  /** Book time where each chapter starts, in order. */
  chapterStarts: number[];
}

export interface CategoryRef {
  slug: string;
  nameUk: string;
  nameEn: string | null;
}

/** One Home row: a category and its newest books. */
export interface CategoryRow extends CategoryRef {
  books: BookSummary[];
}

/** A category with how many live books it has (Explore tiles, category chips). */
export interface CategoryCount extends CategoryRef {
  bookCount: number;
}

/** A category page: the category and all of its live books, newest first. */
export interface CategoryDetail extends CategoryRef {
  books: BookSummary[];
}

/** A narrator on an author page, with how many of the author's books they read. */
export interface NarratorCount extends PersonRef {
  bookCount: number;
}

/** An author page: bio, all live books newest first, and who reads them. */
export interface AuthorDetail extends PersonRef {
  bio: string | null;
  books: BookSummary[];
  /** Most books first. */
  narrators: NarratorCount[];
  /** Total length of the author's live books. */
  durationSeconds: number;
}

export interface BookChapter {
  id: string;
  title: string;
  start: number;
  end: number;
}

export interface BookDetail extends BookSummary {
  description: string | null;
  narrator: PersonRef | null;
  category: CategoryRef | null;
  /** 1000 px cover, for the book page and share previews. */
  coverLargeUrl?: string;
  chapters: BookChapter[];
}

type SummaryRow = Pick<
  schema.Book,
  'id' | 'slug' | 'title' | 'coverMediumKey' | 'durationSeconds' | 'language' | 'ongoing'
> & { author: PersonRef | null };

const summaryColumns = {
  id: true,
  slug: true,
  title: true,
  coverMediumKey: true,
  durationSeconds: true,
  language: true,
  ongoing: true,
} as const;
const person = { columns: { slug: true, name: true } } as const;

const toSummary = (row: SummaryRow): BookSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  author: row.author,
  coverUrl: media(row.coverMediumKey),
  durationSeconds: row.durationSeconds,
  language: row.language,
  ongoing: row.ongoing,
});

/** Live books, newest first ("New releases"). */
export async function listNewReleases(db: CatalogueDb, limit = 24): Promise<BookSummary[]> {
  const rows = await db.query.books.findMany({
    columns: summaryColumns,
    with: { author: person },
    where: live,
    orderBy: [desc(books.publishedAt), asc(books.title)],
    limit,
  });
  return rows.map(toSummary);
}

/**
 * Home rows: every category that has live books, in the admin's order, each with its newest
 * books. Categories without live books are left out.
 */
export async function listCategoryRows(db: CatalogueDb, perRow = 12): Promise<CategoryRow[]> {
  const all = await db.query.categories.findMany({
    columns: { id: true, slug: true, nameUk: true, nameEn: true },
    orderBy: [asc(categories.position), asc(categories.nameUk)],
  });
  const rows = await Promise.all(
    all.map(async ({ id, ...category }) => {
      const found = await db.query.books.findMany({
        columns: summaryColumns,
        with: { author: person },
        where: and(eq(books.categoryId, id), live),
        orderBy: [desc(books.publishedAt), asc(books.title)],
        limit: perRow,
      });
      return { ...category, books: found.map(toSummary) };
    }),
  );
  return rows.filter((row) => row.books.length > 0);
}

/**
 * The most books one list page loads. There is no paging yet: the catalogue is tens of
 * books, and a page sorts whatever it gets (`../sort.ts`).
 */
export const LIST_LIMIT = 500;

/** Every live book, newest first (Explore). */
export const listAllBooks = (db: CatalogueDb): Promise<BookSummary[]> =>
  listNewReleases(db, LIST_LIMIT);

/**
 * Categories that have live books, in the admin's order, with their book counts. Empty
 * categories are left out, as on Home.
 */
export async function listCategories(db: CatalogueDb): Promise<CategoryCount[]> {
  return db
    .select({
      slug: categories.slug,
      nameUk: categories.nameUk,
      nameEn: categories.nameEn,
      bookCount: count(books.id),
    })
    .from(categories)
    .innerJoin(books, and(eq(books.categoryId, categories.id), live))
    .groupBy(categories.id)
    .orderBy(asc(categories.position), asc(categories.nameUk));
}

/**
 * A category with all of its live books, newest first. `null` for an unknown slug; a
 * category that exists but has no live books comes back with an empty list.
 */
export async function getCategoryBySlug(
  db: CatalogueDb,
  slug: string,
): Promise<CategoryDetail | null> {
  const category = await db.query.categories.findFirst({
    columns: { id: true, slug: true, nameUk: true, nameEn: true },
    where: eq(categories.slug, slug),
  });
  if (!category) return null;
  const { id, ...ref } = category;
  const rows = await db.query.books.findMany({
    columns: summaryColumns,
    with: { author: person },
    where: and(eq(books.categoryId, id), live),
    orderBy: [desc(books.publishedAt), asc(books.title)],
    limit: LIST_LIMIT,
  });
  return { ...ref, books: rows.map(toSummary) };
}

/**
 * An author with their live books, newest first. `null` for an unknown slug and for an
 * author with no live books: listeners only meet authors through books they can open.
 */
export async function getAuthorBySlug(db: CatalogueDb, slug: string): Promise<AuthorDetail | null> {
  const author = await db.query.authors.findFirst({
    columns: { id: true, slug: true, name: true, bio: true },
    where: eq(authors.slug, slug),
  });
  if (!author) return null;
  const rows = await db.query.books.findMany({
    columns: summaryColumns,
    with: { author: person, narrator: person },
    where: and(eq(books.authorId, author.id), live),
    orderBy: [desc(books.publishedAt), asc(books.title)],
    limit: LIST_LIMIT,
  });
  if (rows.length === 0) return null;

  const narrators = new Map<string, NarratorCount>();
  for (const { narrator } of rows) {
    if (!narrator) continue;
    const seen = narrators.get(narrator.slug);
    if (seen) seen.bookCount += 1;
    else narrators.set(narrator.slug, { ...narrator, bookCount: 1 });
  }
  return {
    slug: author.slug,
    name: author.name,
    bio: author.bio,
    books: rows.map(toSummary),
    narrators: [...narrators.values()].sort(
      (a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name, 'uk'),
    ),
    durationSeconds: rows.reduce((sum, row) => sum + row.durationSeconds, 0),
  };
}

/** The most ids one "Continue listening" request may ask for. */
export const MAX_BOOK_IDS = 12;

/**
 * Live books by id, for "Continue listening" (the ids come from progress saved on the
 * device). Ids that are not live, unknown or malformed are simply missing from the result.
 */
export async function listBooksByIds(
  db: CatalogueDb,
  ids: readonly string[],
): Promise<ContinueBook[]> {
  const valid = [...new Set(ids.filter((id) => UUID.test(id)))].slice(0, MAX_BOOK_IDS);
  if (valid.length === 0) return [];
  const rows = await db.query.books.findMany({
    columns: summaryColumns,
    with: {
      author: person,
      chapters: { columns: { startSeconds: true }, orderBy: [asc(chapters.position)] },
    },
    where: and(inArray(books.id, valid), live),
  });
  return rows.map((row) => ({
    ...toSummary(row),
    chapterStarts: row.chapters.map((chapter) => chapter.startSeconds),
  }));
}

/** A live book for its page, or `null` (unknown, draft, scheduled or deleted → NotFound). */
export async function getBookBySlug(db: CatalogueDb, slug: string): Promise<BookDetail | null> {
  const row = await db.query.books.findFirst({
    columns: { ...summaryColumns, description: true, coverLargeKey: true },
    with: {
      author: person,
      narrator: person,
      category: { columns: { slug: true, nameUk: true, nameEn: true } },
      chapters: {
        columns: { id: true, title: true, startSeconds: true, endSeconds: true },
        orderBy: [asc(chapters.position)],
      },
    },
    where: and(eq(books.slug, slug), live),
  });
  if (!row) return null;
  return {
    ...toSummary(row),
    description: row.description,
    narrator: row.narrator,
    category: row.category,
    coverLargeUrl: media(row.coverLargeKey),
    chapters: row.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      start: chapter.startSeconds,
      end: chapter.endSeconds,
    })),
  };
}

/**
 * Everything the player needs to play a live book: ready tracks in order, with public URLs,
 * and the chapters. `null` when the book is not live or has nothing playable.
 */
export async function getPlayerBook(db: CatalogueDb, id: string): Promise<PlayerBook | null> {
  if (!UUID.test(id)) return null;
  const row = await db.query.books.findFirst({
    columns: { id: true, slug: true, title: true, coverMediumKey: true, ongoing: true },
    with: {
      author: { columns: { name: true } },
      tracks: {
        columns: { id: true, r2Key: true, durationSeconds: true },
        where: eq(tracks.status, 'ready'),
        orderBy: [asc(tracks.position), asc(tracks.createdAt)],
      },
      chapters: {
        columns: { id: true, title: true, startSeconds: true, endSeconds: true },
        orderBy: [asc(chapters.position)],
      },
    },
    where: and(eq(books.id, id), live),
  });
  if (!row || row.tracks.length === 0) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author?.name ?? '',
    coverUrl: media(row.coverMediumKey),
    tracks: row.tracks.map((track) => ({
      id: track.id,
      url: publicUrl(track.r2Key, mediaBase()),
      duration: track.durationSeconds,
    })),
    chapters: row.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      start: chapter.startSeconds,
      end: chapter.endSeconds,
    })),
    ongoing: row.ongoing,
  };
}
