import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
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

const { books, tracks, chapters, categories, authors, narrators } = schema;
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

/** The most ids one books-by-id request may ask for (Continue listening, the Library page). */
export const MAX_BOOK_IDS = 100;

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

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

/** A book found by search: the card data, plus who reads it (shown in the result row). */
export interface SearchBook extends BookSummary {
  narrator: PersonRef | null;
}

/** An author or narrator found by search, with how many live books they have. */
export interface SearchPerson extends PersonRef {
  bookCount: number;
}

export interface SearchResults {
  /** Best match first. */
  books: SearchBook[];
  authors: SearchPerson[];
  narrators: SearchPerson[];
}

/** At most this many words of a query are used, each cut to `MAX_TOKEN_LENGTH` characters. */
export const MAX_SEARCH_TOKENS = 5;
const MAX_TOKEN_LENGTH = 40;
const BOOK_LIMIT = 50;
const PEOPLE_LIMIT = 12;
/** How alike two words must be (pg_trgm `word_similarity`, 0–1) to count as the same word. */
const SIMILARITY = 0.55;

/** The words of a search query: letters and digits, lower-cased, no punctuation. */
export function searchTokens(query: string): string[] {
  return (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, MAX_SEARCH_TOKENS)
    .map((token) => token.slice(0, MAX_TOKEN_LENGTH));
}

/**
 * The part of a word that survives inflection: Ukrainian "перстень" and "персня" share
 * "перс", English "holmes" and "holmes's" share "holm". Short words are used whole.
 */
export function searchStem(token: string): string {
  const length = [...token].length;
  if (length <= 4) return token;
  return [...token].slice(0, length <= 5 ? length - 1 : 4).join('');
}

/**
 * How well one query word matches a column, 0–1: 1 when a word of the column starts with the
 * word's stem, otherwise pg_trgm's word similarity (which forgives typos). Words of three
 * letters or fewer only match by prefix, because trigrams say little about them.
 *
 * Both sides go through `search_norm` (migration 0003), so case, accents and й/и do not matter.
 */
function fieldScore(token: string, column: SQL | AnyPgColumn): SQL<number> {
  const text = sql`public.search_norm(${column})`;
  const prefix = sql`position(' ' || public.search_norm(${searchStem(token)}) in ' ' || ${text}) > 0`;
  if ([...token].length <= 3) return sql<number>`(case when ${prefix} then 1.0 else 0.0 end)`;
  return sql<number>`(case when ${prefix} then 1.0
    else extensions.word_similarity(public.search_norm(${token}), ${text}) end)`;
}

const matches = (token: string, column: SQL | AnyPgColumn): SQL =>
  sql`(${fieldScore(token, column)} >= ${SIMILARITY})`;

/**
 * Books, authors and narrators matching a query. Every word of the query must match
 * (a book's title, author or narrator); results are ranked by how closely, title first.
 * Only live books are found, and people only through their live books.
 */
export async function searchCatalogue(db: CatalogueDb, query: string): Promise<SearchResults> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return { books: [], authors: [], narrators: [] };

  const bookRank = sql<number>`(${sql.join(
    tokens.map(
      (token) =>
        sql`greatest(${fieldScore(token, books.title)} * 1.5, ${fieldScore(token, authors.name)}, ${fieldScore(token, narrators.name)})`,
    ),
    sql` + `,
  )})`;
  const bookRows = await db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      coverMediumKey: books.coverMediumKey,
      durationSeconds: books.durationSeconds,
      language: books.language,
      ongoing: books.ongoing,
      authorSlug: authors.slug,
      authorName: authors.name,
      narratorSlug: narrators.slug,
      narratorName: narrators.name,
    })
    .from(books)
    .leftJoin(authors, eq(authors.id, books.authorId))
    .leftJoin(narrators, eq(narrators.id, books.narratorId))
    .where(
      and(
        live,
        ...tokens.map((token) =>
          or(
            matches(token, books.title),
            matches(token, authors.name),
            matches(token, narrators.name),
          ),
        ),
      ),
    )
    .orderBy(desc(bookRank), desc(books.publishedAt), asc(books.title))
    .limit(BOOK_LIMIT);

  const people = (table: typeof authors | typeof narrators, foreignKey: AnyPgColumn) => {
    const rank = sql<number>`(${sql.join(
      tokens.map((token) => fieldScore(token, table.name)),
      sql` + `,
    )})`;
    return db
      .select({ slug: table.slug, name: table.name, bookCount: count(books.id) })
      .from(table)
      .innerJoin(books, and(eq(foreignKey, table.id), live))
      .where(and(...tokens.map((token) => matches(token, table.name))))
      .groupBy(table.id)
      .orderBy(desc(rank), asc(table.name))
      .limit(PEOPLE_LIMIT);
  };
  const [authorRows, narratorRows] = await Promise.all([
    people(authors, books.authorId),
    people(narrators, books.narratorId),
  ]);

  return {
    books: bookRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      author:
        row.authorSlug && row.authorName ? { slug: row.authorSlug, name: row.authorName } : null,
      narrator:
        row.narratorSlug && row.narratorName
          ? { slug: row.narratorSlug, name: row.narratorName }
          : null,
      coverUrl: media(row.coverMediumKey),
      durationSeconds: row.durationSeconds,
      language: row.language,
      ongoing: row.ongoing,
    })),
    authors: authorRows,
    narrators: narratorRows,
  };
}
