/**
 * Drizzle schema for the `public` schema — the single source of truth for tables.
 *
 * Phase 3: the catalogue (books, tracks, chapters, authors, narrators, categories, moods).
 * Sync tables arrive in Phase 6.
 *
 * Rules that hold for every table here:
 * - Only the Next.js server reads and writes them (ADR 4). Supabase also exposes `public`
 *   through its Data API, so Row Level Security is enabled with no policies: the API roles
 *   see nothing, the server's own connection is not affected.
 * - R2 keys are stored, never rebuilt (ADR 1).
 */
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** PRD book lifecycle. "Needs attention" is a computed flag, not a status. */
export const bookStatus = pgEnum('book_status', ['draft', 'scheduled', 'published']);
/** ADR 3: per-track upload state, shown in the admin. */
export const trackStatus = pgEnum('track_status', ['uploading', 'processing', 'ready', 'failed']);

export const authors = pgTable(
  'authors',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    bio: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('authors_slug_key').on(t.slug)],
).enableRLS();

export const narrators = pgTable(
  'narrators',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('narrators_slug_key').on(t.slug)],
).enableRLS();

/**
 * Categories and moods are part of the interface, so unlike book metadata they have a name
 * per UI language. English falls back to Ukrainian when empty.
 */
export const categories = pgTable(
  'categories',
  {
    id: id(),
    slug: text().notNull(),
    nameUk: text().notNull(),
    nameEn: text(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug)],
).enableRLS();

/** Table ready now; the listener UI and admin screen for moods are v1.1. */
export const moods = pgTable(
  'moods',
  {
    id: id(),
    slug: text().notNull(),
    nameUk: text().notNull(),
    nameEn: text(),
    position: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('moods_slug_key').on(t.slug)],
).enableRLS();

export const books = pgTable(
  'books',
  {
    id: id(),
    slug: text().notNull(),
    title: text().notNull(),
    description: text(),
    /** Language of the recording: book metadata is stored in one language, not translated. */
    language: text().notNull().default('uk'),
    // Nullable so a draft can be saved at any time; publishing requires author, category,
    // cover and at least one ready track (checked in the admin, Phase 4).
    authorId: uuid().references(() => authors.id, { onDelete: 'restrict' }),
    narratorId: uuid().references(() => narrators.id, { onDelete: 'set null' }),
    categoryId: uuid().references(() => categories.id, { onDelete: 'restrict' }),
    status: bookStatus().notNull().default('draft'),
    /** v1.1 scheduled publishing. */
    publishAt: timestamp({ withTimezone: true }),
    /** First time the book went live; "New releases" sorts by it. */
    publishedAt: timestamp({ withTimezone: true }),
    /** Published before all parts are out ("Ongoing · more parts coming"). */
    ongoing: boolean().notNull().default(false),
    /** Square cover in three sizes (1000 / 500 / 250 px). */
    coverLargeKey: text(),
    coverMediumKey: text(),
    coverSmallKey: text(),
    /** Sum of ready tracks, kept in step by whoever changes the tracks. */
    durationSeconds: doublePrecision().notNull().default(0),
    /** Soft delete: hidden everywhere, purged after 30 days (Phase 8). */
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('books_slug_key').on(t.slug),
    // The listener app only ever asks for live books.
    index('books_live_published_at_idx')
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index('books_author_id_idx').on(t.authorId),
    index('books_category_id_idx').on(t.categoryId),
    index('books_narrator_id_idx').on(t.narratorId),
    check('books_language_check', sql`${t.language} in ('uk', 'en')`),
    check('books_duration_check', sql`${t.durationSeconds} >= 0`),
  ],
).enableRLS();

export const bookMoods = pgTable(
  'book_moods',
  {
    bookId: uuid()
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    moodId: uuid()
      .notNull()
      .references(() => moods.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.moodId] }),
    index('book_moods_mood_id_idx').on(t.moodId),
  ],
).enableRLS();

/** An uploaded audio file. Listeners never see tracks, only chapters. */
export const tracks = pgTable(
  'tracks',
  {
    id: id(),
    bookId: uuid()
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    /** Order within the book, from 1. Not unique, so a reorder needs no juggling. */
    position: integer().notNull(),
    r2Key: text().notNull(),
    /** 'audio/mpeg' or 'audio/mp4' (ADR 3). */
    mimeType: text().notNull().default('audio/mpeg'),
    durationSeconds: doublePrecision().notNull().default(0),
    sizeBytes: bigint({ mode: 'number' }),
    originalFilename: text(),
    status: trackStatus().notNull().default('uploading'),
    failureReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('tracks_book_id_position_idx').on(t.bookId, t.position),
    check('tracks_duration_check', sql`${t.durationSeconds} >= 0`),
  ],
).enableRLS();

/** A titled range of book time (seconds from the start of the book), independent of tracks. */
export const chapters = pgTable(
  'chapters',
  {
    id: id(),
    bookId: uuid()
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    title: text().notNull(),
    startSeconds: doublePrecision().notNull(),
    endSeconds: doublePrecision().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('chapters_book_id_position_idx').on(t.bookId, t.position),
    check(
      'chapters_range_check',
      sql`${t.startSeconds} >= 0 and ${t.endSeconds} > ${t.startSeconds}`,
    ),
  ],
).enableRLS();

// ── Relations (for `db.query`) ─────────────────────────────────────────────────

export const authorsRelations = relations(authors, ({ many }) => ({ books: many(books) }));
export const narratorsRelations = relations(narrators, ({ many }) => ({ books: many(books) }));
export const categoriesRelations = relations(categories, ({ many }) => ({ books: many(books) }));
export const moodsRelations = relations(moods, ({ many }) => ({ bookMoods: many(bookMoods) }));

export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(authors, { fields: [books.authorId], references: [authors.id] }),
  narrator: one(narrators, { fields: [books.narratorId], references: [narrators.id] }),
  category: one(categories, { fields: [books.categoryId], references: [categories.id] }),
  tracks: many(tracks),
  chapters: many(chapters),
  bookMoods: many(bookMoods),
}));

export const bookMoodsRelations = relations(bookMoods, ({ one }) => ({
  book: one(books, { fields: [bookMoods.bookId], references: [books.id] }),
  mood: one(moods, { fields: [bookMoods.moodId], references: [moods.id] }),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  book: one(books, { fields: [tracks.bookId], references: [books.id] }),
}));

export const chaptersRelations = relations(chapters, ({ one }) => ({
  book: one(books, { fields: [chapters.bookId], references: [books.id] }),
}));

export type Book = typeof books.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Author = typeof authors.$inferSelect;
export type Narrator = typeof narrators.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Mood = typeof moods.$inferSelect;
