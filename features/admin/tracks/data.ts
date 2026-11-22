import { and, asc, eq, isNull, max } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { trackKey } from '@/lib/r2/keys';
import type { AdminDb } from '../data/books';
import { isUuid } from '../book-form/values';
import {
  bookDurationSeconds,
  cutTime,
  insertTime,
  nextChapterRange,
  sizeMatches,
  trackStartSeconds,
} from './chapters';
import { checkAudioFile } from './file-check';
import { canTransition } from './status';

const { books, tracks, chapters } = schema;

const MAX_TITLE = 200;
const HEX = /^[a-f0-9]{8,64}$/;

export interface TrackItem {
  id: string;
  position: number;
  title: string;
  originalFilename: string | null;
  status: schema.Track['status'];
  failureReason: string | null;
  durationSeconds: number;
  sizeBytes: number | null;
}

export interface ChapterItem {
  id: string;
  position: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
}

/** The parts and chapters of a book, in play order. */
export async function getBookTracks(
  db: AdminDb,
  bookId: string,
): Promise<{ tracks: TrackItem[]; chapters: ChapterItem[] }> {
  if (!isUuid(bookId)) return { tracks: [], chapters: [] };
  const [trackRows, chapterRows] = await Promise.all([
    db
      .select({
        id: tracks.id,
        position: tracks.position,
        title: tracks.title,
        originalFilename: tracks.originalFilename,
        status: tracks.status,
        failureReason: tracks.failureReason,
        durationSeconds: tracks.durationSeconds,
        sizeBytes: tracks.sizeBytes,
      })
      .from(tracks)
      .where(eq(tracks.bookId, bookId))
      .orderBy(asc(tracks.position), asc(tracks.createdAt)),
    db
      .select({
        id: chapters.id,
        position: chapters.position,
        title: chapters.title,
        startSeconds: chapters.startSeconds,
        endSeconds: chapters.endSeconds,
      })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(asc(chapters.position), asc(chapters.startSeconds)),
  ]);
  return { tracks: trackRows, chapters: chapterRows };
}

export interface UploadInput {
  file: { name: string; type: string; size: number };
  /** Hex SHA-256 of the file, made in the browser (the object key carries its first 8 characters). */
  hash: string;
  /** Read from the file in the browser. */
  durationSeconds: number;
}

type Tx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];

const titleFromFilename = (name: string) =>
  name
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, MAX_TITLE);

function validate(input: UploadInput) {
  const checked = checkAudioFile(input.file);
  if (!checked.ok)
    return { ok: false as const, reason: 'bad_file' as const, message: checked.reason };
  if (!HEX.test(input.hash)) {
    return {
      ok: false as const,
      reason: 'bad_file' as const,
      message: 'The file fingerprint is not valid.',
    };
  }
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    return {
      ok: false as const,
      reason: 'bad_duration' as const,
      message: 'The length of this file could not be read. Is it a valid MP3 or M4A?',
    };
  }
  return { ok: true as const, checked };
}

export type BeginResult =
  | { ok: true; trackId: string; key: string; mimeType: string }
  | {
      ok: false;
      reason: 'book_missing' | 'bad_file' | 'bad_duration' | 'wrong_state';
      message?: string;
    };

/** Locks the book row so uploads and track changes for one book queue up instead of racing. */
async function lockBook(tx: Tx, bookId: string) {
  const [book] = await tx
    .select({ id: books.id, slug: books.slug, status: books.status })
    .from(books)
    .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
    .for('update');
  return book;
}

/**
 * Step 1 of an upload: add the part as `uploading` at the next position and work out its object
 * key. The caller then presigns that key. The key is built here and nowhere else (ADR 1).
 */
export async function beginTrackUpload(
  db: AdminDb,
  input: UploadInput & { bookId: string },
): Promise<BeginResult> {
  const valid = validate(input);
  if (!valid.ok) return valid;
  if (!isUuid(input.bookId)) return { ok: false, reason: 'book_missing' };
  const { checked } = valid;

  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId.toLowerCase());
    if (!book) return { ok: false as const, reason: 'book_missing' as const };

    const [{ top } = { top: null }] = await tx
      .select({ top: max(tracks.position) })
      .from(tracks)
      .where(eq(tracks.bookId, book.id));
    const position = (top ?? 0) + 1;
    const title = titleFromFilename(input.file.name) || `Part ${position}`;
    const key = trackKey({
      bookSlug: book.slug,
      number: position,
      title,
      hash: input.hash,
      ext: checked.ext,
    });
    const [row] = await tx
      .insert(tracks)
      .values({
        bookId: book.id,
        position,
        title,
        r2Key: key,
        mimeType: checked.mimeType,
        durationSeconds: input.durationSeconds,
        sizeBytes: input.file.size,
        originalFilename: input.file.name,
        status: 'uploading',
      })
      .returning({ id: tracks.id });
    return { ok: true as const, trackId: row!.id, key, mimeType: checked.mimeType };
  });
}

/** Retry: a failed part starts over with a (possibly different) file, keeping its place and title. */
export async function restartTrackUpload(
  db: AdminDb,
  trackId: string,
  input: UploadInput,
): Promise<BeginResult> {
  const valid = validate(input);
  if (!valid.ok) return valid;
  if (!isUuid(trackId)) return { ok: false, reason: 'wrong_state' };
  const { checked } = valid;

  return db.transaction(async (tx) => {
    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId.toLowerCase()));
    if (!track) return { ok: false as const, reason: 'wrong_state' as const };
    const book = await lockBook(tx, track.bookId);
    if (!book) return { ok: false as const, reason: 'book_missing' as const };
    if (!canTransition(track.status, 'uploading')) {
      return { ok: false as const, reason: 'wrong_state' as const };
    }
    const key = trackKey({
      bookSlug: book.slug,
      number: track.position,
      title: track.title,
      hash: input.hash,
      ext: checked.ext,
    });
    await tx
      .update(tracks)
      .set({
        status: 'uploading',
        failureReason: null,
        r2Key: key,
        mimeType: checked.mimeType,
        durationSeconds: input.durationSeconds,
        sizeBytes: input.file.size,
        originalFilename: input.file.name,
        updatedAt: new Date(),
      })
      .where(eq(tracks.id, track.id));
    return { ok: true as const, trackId: track.id, key, mimeType: checked.mimeType };
  });
}

export type StepResult =
  { ok: true } | { ok: false; reason: 'wrong_state' | 'missing' | 'failed'; message?: string };

/** The browser could not finish the upload: record why, so the list can show it. */
export async function failTrackUpload(
  db: AdminDb,
  trackId: string,
  reason: string,
): Promise<StepResult> {
  if (!isUuid(trackId)) return { ok: false, reason: 'missing' };
  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId.toLowerCase()));
  if (!track) return { ok: false, reason: 'missing' };
  if (!canTransition(track.status, 'failed')) return { ok: false, reason: 'wrong_state' };
  await db
    .update(tracks)
    .set({ status: 'failed', failureReason: reason.slice(0, 300), updatedAt: new Date() })
    .where(and(eq(tracks.id, track.id), eq(tracks.status, track.status)));
  return { ok: true };
}

export type HeadFn = (key: string) => Promise<{ size: number } | null>;

async function markFailed(db: AdminDb, trackId: string, reason: string) {
  await db
    .update(tracks)
    .set({ status: 'failed', failureReason: reason, updatedAt: new Date() })
    .where(eq(tracks.id, trackId));
}

/**
 * Step 2 of an upload, after the browser has sent the file: uploading → processing, confirm with
 * storage that the object is there and exactly as large as expected, then processing → ready
 * with its chapter and the book's length (ADR 3, no transcoding). Any problem ends as `failed`
 * with a reason, never as an exception.
 */
export async function completeTrackUpload(
  db: AdminDb,
  trackId: string,
  head: HeadFn,
): Promise<StepResult> {
  if (!isUuid(trackId)) return { ok: false, reason: 'missing' };
  const id = trackId.toLowerCase();
  const [claimed] = await db
    .update(tracks)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(and(eq(tracks.id, id), eq(tracks.status, 'uploading')))
    .returning();
  if (!claimed) {
    const [exists] = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.id, id));
    return { ok: false, reason: exists ? 'wrong_state' : 'missing' };
  }

  let stored: { size: number } | null;
  try {
    stored = await head(claimed.r2Key);
  } catch (error) {
    console.error('Checking an uploaded track failed', error);
    const message = 'Could not check the uploaded file. Try again.';
    await markFailed(db, id, message);
    return { ok: false, reason: 'failed', message };
  }
  if (!stored) {
    const message = 'The file did not arrive in storage. Try again.';
    await markFailed(db, id, message);
    return { ok: false, reason: 'failed', message };
  }
  if (!sizeMatches(claimed.sizeBytes ?? -1, stored.size)) {
    const message = `The stored file is ${stored.size} bytes but ${claimed.sizeBytes} were expected. Try again.`;
    await markFailed(db, id, message);
    return { ok: false, reason: 'failed', message };
  }

  await db.transaction(async (tx) => {
    const book = await lockBook(tx, claimed.bookId);
    if (!book) return;
    const trackRows = await tx.select().from(tracks).where(eq(tracks.bookId, book.id));
    // `claimed` is still `processing` in the list; it joins the timeline now.
    const asReady = trackRows.map((t) => (t.id === id ? { ...t, status: 'ready' as const } : t));
    const start = trackStartSeconds(asReady, id);
    const existing = await tx.select().from(chapters).where(eq(chapters.bookId, book.id));
    const shifted = insertTime(existing, start, claimed.durationSeconds);
    for (const c of shifted) {
      const before = existing.find((e) => e.id === c.id)!;
      if (c.startSeconds !== before.startSeconds || c.endSeconds !== before.endSeconds) {
        await tx
          .update(chapters)
          .set({ startSeconds: c.startSeconds, endSeconds: c.endSeconds, updatedAt: new Date() })
          .where(eq(chapters.id, c.id));
      }
    }
    const range = nextChapterRange(start, claimed.durationSeconds);
    await tx.insert(chapters).values({
      bookId: book.id,
      position: 0, // renumbered just below
      title: claimed.title,
      ...range,
    });
    await tx
      .update(tracks)
      .set({ status: 'ready', failureReason: null, updatedAt: new Date() })
      .where(eq(tracks.id, id));
    await renumberChapters(tx, book.id);
    await syncBookDuration(tx, book.id);
  });
  return { ok: true };
}

/** Chapters are numbered 1, 2, 3… in book-time order. */
async function renumberChapters(tx: Tx, bookId: string) {
  const rows = await tx
    .select({ id: chapters.id })
    .from(chapters)
    .where(eq(chapters.bookId, bookId))
    .orderBy(asc(chapters.startSeconds), asc(chapters.createdAt));
  for (const [index, row] of rows.entries()) {
    await tx
      .update(chapters)
      .set({ position: index + 1 })
      .where(eq(chapters.id, row.id));
  }
}

/** `books.duration_seconds` = the sum of the ready tracks. */
async function syncBookDuration(tx: Tx, bookId: string) {
  const rows = await tx
    .select({ status: tracks.status, durationSeconds: tracks.durationSeconds })
    .from(tracks)
    .where(eq(tracks.bookId, bookId));
  await tx
    .update(books)
    .set({ durationSeconds: bookDurationSeconds(rows), updatedAt: new Date() })
    .where(eq(books.id, bookId));
}

export type RenameResult = { ok: true } | { ok: false; reason: 'invalid' | 'missing' };

function cleanTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed && trimmed.length <= MAX_TITLE ? trimmed : null;
}

export async function renameTrack(
  db: AdminDb,
  trackId: string,
  title: string,
): Promise<RenameResult> {
  const clean = cleanTitle(title);
  if (!clean) return { ok: false, reason: 'invalid' };
  if (!isUuid(trackId)) return { ok: false, reason: 'missing' };
  const rows = await db
    .update(tracks)
    .set({ title: clean, updatedAt: new Date() })
    .where(eq(tracks.id, trackId.toLowerCase()))
    .returning({ id: tracks.id });
  return rows.length ? { ok: true } : { ok: false, reason: 'missing' };
}

export async function renameChapter(
  db: AdminDb,
  chapterId: string,
  title: string,
): Promise<RenameResult> {
  const clean = cleanTitle(title);
  if (!clean) return { ok: false, reason: 'invalid' };
  if (!isUuid(chapterId)) return { ok: false, reason: 'missing' };
  const rows = await db
    .update(chapters)
    .set({ title: clean, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId.toLowerCase()))
    .returning({ id: chapters.id });
  return rows.length ? { ok: true } : { ok: false, reason: 'missing' };
}

export type RemoveResult = { ok: true } | { ok: false; reason: 'missing' | 'published' };

/**
 * Removes the part from the book (the stored file is left alone; abandoned objects are swept
 * in Phase 8). A ready part can only go from a draft: listeners may be playing a published
 * book. Its stretch of book time is cut out of the chapters.
 */
export async function removeTrack(db: AdminDb, trackId: string): Promise<RemoveResult> {
  if (!isUuid(trackId)) return { ok: false, reason: 'missing' };
  return db.transaction(async (tx) => {
    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId.toLowerCase()));
    if (!track) return { ok: false as const, reason: 'missing' as const };
    const book = await lockBook(tx, track.bookId);
    if (!book) return { ok: false as const, reason: 'missing' as const };
    if (track.status === 'ready' && book.status !== 'draft') {
      return { ok: false as const, reason: 'published' as const };
    }

    if (track.status === 'ready') {
      const trackRows = await tx.select().from(tracks).where(eq(tracks.bookId, book.id));
      const start = trackStartSeconds(trackRows, track.id);
      const existing = await tx.select().from(chapters).where(eq(chapters.bookId, book.id));
      const cut = cutTime(existing, start, start + track.durationSeconds);
      const keep = new Set(cut.map((c) => c.id));
      for (const c of existing) {
        if (!keep.has(c.id)) await tx.delete(chapters).where(eq(chapters.id, c.id));
      }
      for (const c of cut) {
        await tx
          .update(chapters)
          .set({ startSeconds: c.startSeconds, endSeconds: c.endSeconds, updatedAt: new Date() })
          .where(eq(chapters.id, c.id));
      }
    }
    await tx.delete(tracks).where(eq(tracks.id, track.id));
    if (track.status === 'ready') {
      await renumberChapters(tx, book.id);
      await syncBookDuration(tx, book.id);
    }
    return { ok: true as const };
  });
}
