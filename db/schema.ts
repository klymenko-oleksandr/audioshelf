/**
 * Drizzle schema for the `public` schema — the single source of truth for tables.
 *
 * Phase 3: the catalogue (books, tracks, chapters, authors, narrators, categories, moods).
 * Phase 6b: the sync tables (`sync_*`), one set of rows per listener (ADR 4).
 *
 * Rules that hold for every table here:
 * - Only the Next.js server reads and writes them (ADR 4). Supabase also exposes `public`
 *   through its Data API, so Row Level Security is enabled with no policies: the API roles
 *   see nothing, the server's own connection is not affected.
 * - R2 keys are stored, never rebuilt (ADR 1).
 */
import { relations, sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
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
    /** What the admin sees for this file in the track list; chapters are named separately. */
    title: text().notNull().default(''),
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

/**
 * Failed-login bookkeeping for the admin panel (ADR 5): one row per client address, keyed by
 * an HMAC of the IP so no address is stored. Lives in the database because serverless
 * instances keep no memory between requests. Rows are tiny and cleaned up as they age.
 */
export const adminLoginAttempts = pgTable(
  'admin_login_attempts',
  {
    /** `ip:` + hex HMAC of the client address (lib/auth/admin/client-ip.ts). */
    key: text().primaryKey(),
    /** Attempts counted in the current window, the one in progress included. */
    failedCount: integer().notNull().default(0),
    lastAttemptAt: timestamp({ withTimezone: true }),
    /** While in the future, every attempt from this address is refused unchecked. */
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('admin_login_attempts_last_attempt_at_idx').on(t.lastAttemptAt),
    check('admin_login_attempts_count_check', sql`${t.failedCount} >= 0`),
  ],
).enableRLS();

// ── Sync (Phase 6b, ADR 4) ─────────────────────────────────────────────────────
//
// One row per listener and item. Every row carries the corrected client time it was last
// written (`updated_at`), the device that wrote it, and a `seq` from one shared sequence: the
// pull cursor. A removed item stays as a tombstone (`deleted_at`). The merge rules live in
// `features/sync/merge.ts`; these tables only store the winner.
//
// `user_id` references Supabase's `auth.users`, which this schema does not manage: the table is
// declared in `drizzle-orm/supabase` and left out of the migrations by `schemaFilter`.

/** Shared by all four tables, so one number orders every change a listener has made. */
export const syncChangeSeq = pgSequence('sync_change_seq');
const seq = () =>
  bigint({ mode: 'number' })
    .notNull()
    .default(sql`nextval('sync_change_seq')`);
const syncUser = () =>
  uuid()
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' });
const syncBook = () =>
  uuid()
    .notNull()
    .references(() => books.id, { onDelete: 'cascade' });
const syncTime = () => timestamp({ withTimezone: true });

export const syncFlagKind = pgEnum('sync_flag_kind', ['like', 'listen_later']);

/** Each browser or phone that has pushed; its name and clock offset feed the conflict prompt. */
export const syncDevices = pgTable(
  'sync_devices',
  {
    userId: syncUser(),
    deviceId: uuid().notNull(),
    name: text().notNull().default(''),
    /** `server now − client now` at the last push (ADR 4), stored clamped to a 32-bit integer. */
    clockOffsetMs: integer().notNull().default(0),
    lastPushAt: syncTime(),
    lastSeenAt: syncTime().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceId] })],
).enableRLS();

export const syncProgress = pgTable(
  'sync_progress',
  {
    userId: syncUser(),
    bookId: syncBook(),
    positionSeconds: doublePrecision().notNull(),
    durationSeconds: doublePrecision().notNull(),
    speed: real().notNull().default(1),
    finished: boolean().notNull().default(false),
    /** Removed from Continue listening. */
    dismissedAt: syncTime(),
    /** Tombstone: removed from History (the saved place is cleared too). */
    deletedAt: syncTime(),
    updatedAt: syncTime().notNull(),
    deviceId: uuid().notNull(),
    seq: seq(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.bookId] }),
    index('sync_progress_user_seq').on(t.userId, t.seq),
  ],
).enableRLS();

export const syncFlags = pgTable(
  'sync_flags',
  {
    userId: syncUser(),
    bookId: syncBook(),
    kind: syncFlagKind().notNull(),
    addedAt: syncTime().notNull(),
    deletedAt: syncTime(),
    updatedAt: syncTime().notNull(),
    deviceId: uuid().notNull(),
    seq: seq(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.bookId, t.kind] }),
    index('sync_flags_user_seq').on(t.userId, t.seq),
  ],
).enableRLS();

export const syncHistory = pgTable(
  'sync_history',
  {
    userId: syncUser(),
    bookId: syncBook(),
    startedAt: syncTime().notNull(),
    lastPlayedAt: syncTime().notNull(),
    finishedAt: syncTime(),
    deletedAt: syncTime(),
    updatedAt: syncTime().notNull(),
    deviceId: uuid().notNull(),
    seq: seq(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.bookId] }),
    index('sync_history_user_seq').on(t.userId, t.seq),
  ],
).enableRLS();

export const syncSettings = pgTable(
  'sync_settings',
  {
    userId: syncUser(),
    key: text().notNull(),
    value: jsonb().notNull(),
    updatedAt: syncTime().notNull(),
    deviceId: uuid().notNull(),
    seq: seq(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index('sync_settings_user_seq').on(t.userId, t.seq),
  ],
).enableRLS();
