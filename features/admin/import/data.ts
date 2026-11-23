/**
 * The content import (Phase 4e, content track C3): a script creates or extends a book without
 * the admin panel. It only composes what the panel already does:
 *
 *   begin     → `saveBook` (a new draft under the slug from book.json), `beginTrackUpload` /
 *               `restartTrackUpload` for the parts to send, and presigned addresses. The audio
 *               goes from the script straight to R2; nothing big passes through a function.
 *   complete  → `completeTrackUpload` (size check in storage, chapter, book length) and, when
 *               asked, `publishBook` with the 4d rules.
 *
 * The book is identified by its slug (slugs never change). Importing again only appends new
 * parts (`plan.ts`); existing parts and chapters are never written. Storage is injected so the
 * flow is tested against a real Postgres (PGlite) and a fake bucket.
 */
import { asc, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { nameKey, saveBook } from '../data/book-form';
import type { AdminDb } from '../data/books';
import type { BookFormInput } from '../book-form/values';
import { describeMissing, type Requirement } from '../publish/rules';
import { publishBook } from '../publish/data';
import {
  beginTrackUpload,
  completeTrackUpload,
  failTrackUpload,
  restartTrackUpload,
  type BeginResult,
  type HeadFn,
} from '../tracks/data';
import {
  needsMultipart,
  partCount,
  validateCompletedParts,
  PART_SIZE_BYTES,
} from '../tracks/multipart';
import type { ImportBook, ImportIssue, ImportPart } from './book-json';
import { planImport, type ExistingTrack } from './plan';
import type { CompleteRequest } from './request';

const { books, tracks, categories, authors, narrators } = schema;

/** The bucket, as the import needs it. `storage.ts` binds it to R2; tests pass a fake. */
export interface ImportStorage {
  singleUpload(input: {
    key: string;
    contentType: string;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  openMultipart(input: { key: string; contentType: string }): Promise<{ uploadId: string }>;
  partUrls(input: { key: string; uploadId: string; partCount: number }): Promise<string[]>;
  completeMultipart(input: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  }): Promise<void>;
  abortMultipart(input: { key: string; uploadId: string }): Promise<void>;
  head: HeadFn;
}

// ── Reading what is there ─────────────────────────────────────────────────────

export interface ImportContext {
  book: {
    id: string;
    status: schema.Book['status'];
    ongoing: boolean;
    deleted: boolean;
  } | null;
  tracks: ExistingTrack[];
  categories: { id: string; slug: string }[];
  authors: { id: string; name: string; bio: string | null }[];
  narrators: { id: string; name: string }[];
}

/** Everything `beginImport` decides from. Reads only, so callers may run it through `readDb`. */
export async function loadImportContext(db: AdminDb, slug: string): Promise<ImportContext> {
  const [book] = await db
    .select({
      id: books.id,
      status: books.status,
      ongoing: books.ongoing,
      deletedAt: books.deletedAt,
    })
    .from(books)
    .where(eq(books.slug, slug));
  const [trackRows, categoryRows, authorRows, narratorRows] = await Promise.all([
    book
      ? db
          .select({
            id: tracks.id,
            position: tracks.position,
            status: tracks.status,
            r2Key: tracks.r2Key,
          })
          .from(tracks)
          .where(eq(tracks.bookId, book.id))
          .orderBy(asc(tracks.position))
      : Promise.resolve([]),
    db.select({ id: categories.id, slug: categories.slug }).from(categories),
    db.select({ id: authors.id, name: authors.name, bio: authors.bio }).from(authors),
    db.select({ id: narrators.id, name: narrators.name }).from(narrators),
  ]);
  return {
    book: book
      ? {
          id: book.id,
          status: book.status,
          ongoing: book.ongoing,
          deleted: book.deletedAt !== null,
        }
      : null,
    tracks: trackRows,
    categories: categoryRows,
    authors: authorRows,
    narrators: narratorRows,
  };
}

// ── Begin ─────────────────────────────────────────────────────────────────────

export type UploadInstruction =
  | { type: 'single'; url: string; headers: Record<string, string> }
  | {
      type: 'multipart';
      uploadId: string;
      /** Cut the file in pieces of this many bytes (the last may be shorter), PUT piece N to `partUrls[N-1]`. */
      partSize: number;
      partCount: number;
      partUrls: string[];
    };

export type BeginPart =
  | { number: number; action: 'skip' | 'changed' | 'removed' | 'blocked' | 'busy' }
  | { number: number; action: 'upload'; trackId: string; key: string; upload: UploadInstruction }
  | { number: number; action: 'error'; message: string };

export type BeginImportResult =
  | {
      ok: true;
      book: { id: string; slug: string; status: schema.Book['status']; created: boolean };
      parts: BeginPart[];
      /** Parts left for a later request. Finish this batch, then send the same book.json again. */
      deferred: number[];
      warnings: string[];
      /** Something was written, so the catalogue cache must be refreshed. */
      changed: boolean;
    }
  | { ok: false; reason: 'book_deleted' | 'slug_taken' }
  | { ok: false; reason: 'invalid'; errors: ImportIssue[] };

const MP3 = 'audio/mpeg';
const MP4 = 'audio/mp4';
const contentTypeOf = (file: string) => (file.toLowerCase().endsWith('.m4a') ? MP4 : MP3);

/** book.json names → the ids the form uses. Unknown people are created, an unknown category is an error. */
function toFormInput(book: ImportBook, ctx: ImportContext) {
  const errors: ImportIssue[] = [];

  let categoryId: string | null = null;
  if (book.category !== null) {
    const found = ctx.categories.find((c) => c.slug === book.category);
    if (found) categoryId = found.id;
    else {
      const known = ctx.categories.map((c) => c.slug).sort();
      errors.push({
        path: 'book.category',
        message: `There is no category "${book.category}". Known categories: ${known.join(', ') || 'none'}.`,
      });
    }
  }

  let author: BookFormInput['author'] = { kind: 'none' };
  let authorBio: string | null = null;
  if (book.author !== null) {
    const key = nameKey(book.author);
    const found = ctx.authors.find((a) => nameKey(a.name) === key);
    if (found) {
      author = { kind: 'existing', id: found.id };
      authorBio = found.bio; // unchanged: the import never writes a bio
    } else author = { kind: 'new', name: book.author };
  }

  let narrator: BookFormInput['narrator'] = { kind: 'none' };
  if (book.narrator !== null) {
    const key = nameKey(book.narrator);
    const found = ctx.narrators.find((n) => nameKey(n.name) === key);
    narrator = found ? { kind: 'existing', id: found.id } : { kind: 'new', name: book.narrator };
  }

  const input: BookFormInput = {
    title: book.title,
    description: book.description,
    language: book.language,
    ongoing: book.ongoing,
    author,
    authorBio,
    narrator,
    categoryId,
  };
  return { input, errors };
}

const uploadInput = (part: ImportPart) => ({
  file: { name: part.file, type: '', size: part.size },
  hash: part.sha256,
  durationSeconds: part.durationSeconds,
});

/** Opens the way for the file: one presigned PUT, or a multipart upload with every part address. */
async function prepareUpload(
  storage: ImportStorage,
  key: string,
  contentType: string,
  size: number,
): Promise<UploadInstruction> {
  if (!needsMultipart(size)) {
    return { type: 'single', ...(await storage.singleUpload({ key, contentType })) };
  }
  const { uploadId } = await storage.openMultipart({ key, contentType });
  try {
    const count = partCount(size);
    const partUrls = await storage.partUrls({ key, uploadId, partCount: count });
    return { type: 'multipart', uploadId, partSize: PART_SIZE_BYTES, partCount: count, partUrls };
  } catch (error) {
    await storage.abortMultipart({ key, uploadId }).catch(() => {});
    throw error;
  }
}

const GENERIC_PREPARE = 'Could not prepare the upload. Try again.';

export async function beginImport(
  db: AdminDb,
  storage: ImportStorage,
  ctx: ImportContext,
  book: ImportBook,
): Promise<BeginImportResult> {
  if (ctx.book?.deleted) return { ok: false, reason: 'book_deleted' };
  let changed = false;

  // 1. The book: created as a draft the first time, never rewritten afterwards except `ongoing`.
  let bookId: string;
  let status: schema.Book['status'] = 'draft';
  let existing: ExistingTrack[] = [];
  const created = ctx.book === null;
  if (ctx.book === null) {
    const { input, errors } = toFormInput(book, ctx);
    if (errors.length > 0) return { ok: false, reason: 'invalid', errors };
    const saved = await saveBook(db, null, input, { slug: book.slug });
    if (!saved.ok) {
      if (saved.reason === 'invalid') {
        return {
          ok: false,
          reason: 'invalid',
          errors: Object.entries(saved.errors).map(([field, message]) => ({
            path: `book.${field}`,
            message: String(message),
          })),
        };
      }
      // Someone else took the slug between our look and our write.
      return { ok: false, reason: 'slug_taken' };
    }
    bookId = saved.id;
    changed = true;
  } else {
    bookId = ctx.book.id;
    status = ctx.book.status;
    existing = ctx.tracks;
    if (ctx.book.ongoing !== book.ongoing) {
      await db
        .update(books)
        .set({ ongoing: book.ongoing, updatedAt: new Date() })
        .where(eq(books.id, bookId));
      changed = true;
    }
  }

  // 2. The parts: only what the plan says.
  const plan = planImport({ bookStatus: status, parts: book.parts, existing });
  const byNumber = new Map(book.parts.map((p) => [p.number, p]));
  const parts: BeginPart[] = [];
  const deferred = [...plan.deferred];
  let failed = false;

  for (const action of plan.actions) {
    if (failed) {
      // After a part that could not be prepared nothing later is started: the book grows in order.
      if (action.kind === 'new' || action.kind === 'resume') {
        deferred.push(action.number);
        continue;
      }
    }
    if (action.kind !== 'new' && action.kind !== 'resume') {
      const label = action.kind === 'skip' ? 'skip' : action.kind;
      parts.push({ number: action.number, action: label });
      continue;
    }

    const part = byNumber.get(action.number)!;
    let begun: BeginResult;
    if (action.kind === 'new') {
      begun = await beginTrackUpload(
        db,
        { ...uploadInput(part), bookId },
        { title: part.title, expectPosition: part.number },
      );
    } else {
      if (action.failFirst) {
        await failTrackUpload(db, action.trackId, 'The previous import was interrupted.');
      }
      begun = await restartTrackUpload(db, action.trackId, uploadInput(part));
    }
    changed = true;

    if (!begun.ok) {
      parts.push({
        number: part.number,
        action: 'error',
        message: begun.message ?? 'This part can no longer be changed.',
      });
      failed = true;
      continue;
    }
    try {
      const upload = await prepareUpload(storage, begun.key, contentTypeOf(part.file), part.size);
      parts.push({
        number: part.number,
        action: 'upload',
        trackId: begun.trackId,
        key: begun.key,
        upload,
      });
    } catch (error) {
      console.error('Preparing an imported upload failed', error);
      await failTrackUpload(db, begun.trackId, 'Could not prepare the upload.');
      parts.push({ number: part.number, action: 'error', message: GENERIC_PREPARE });
      failed = true;
    }
  }

  deferred.sort((a, b) => a - b);
  return {
    ok: true,
    book: { id: bookId, slug: book.slug, status, created },
    parts,
    deferred,
    warnings: plan.warnings,
    changed,
  };
}

// ── Complete ──────────────────────────────────────────────────────────────────

export type PartOutcome = {
  number: number;
  status:
    | 'ready'
    | 'already_ready'
    | 'failed'
    | 'busy'
    | 'not_started'
    | 'needs_upload_info'
    | 'not_attempted';
  message?: string;
};

export type PublishOutcome =
  | { requested: false }
  | {
      requested: true;
      published: boolean;
      /** What is still missing, when the rules refused. */
      missing?: Requirement[];
      message?: string;
    };

export type CompleteImportResult =
  | { ok: false; reason: 'not_found' | 'book_deleted' }
  | {
      ok: true;
      /** True when every listed part is ready. Whether the book was published is in `publish`. */
      allReady: boolean;
      book: { id: string; slug: string; status: schema.Book['status'] };
      parts: PartOutcome[];
      publish: PublishOutcome;
      changed: boolean;
    };

const OPEN_FAILED = 'The parts of the upload were incomplete.';
const JOIN_FAILED = 'Storage could not join the parts of the file. Try again.';

export async function completeImport(
  db: AdminDb,
  storage: ImportStorage,
  request: CompleteRequest,
): Promise<CompleteImportResult> {
  const [book] = await db
    .select({ id: books.id, slug: books.slug, deletedAt: books.deletedAt })
    .from(books)
    .where(eq(books.slug, request.slug));
  if (!book) return { ok: false, reason: 'not_found' };
  if (book.deletedAt) return { ok: false, reason: 'book_deleted' };

  const rows = await db
    .select({
      id: tracks.id,
      position: tracks.position,
      status: tracks.status,
      r2Key: tracks.r2Key,
      sizeBytes: tracks.sizeBytes,
      failureReason: tracks.failureReason,
    })
    .from(tracks)
    .where(eq(tracks.bookId, book.id));
  const byPosition = new Map(rows.map((r) => [r.position, r]));

  const outcomes: PartOutcome[] = [];
  let changed = false;
  let stopped = false;

  for (const item of request.parts) {
    if (stopped) {
      outcomes.push({ number: item.number, status: 'not_attempted' });
      continue;
    }
    const track = byPosition.get(item.number);
    const stop = (outcome: PartOutcome) => {
      outcomes.push(outcome);
      stopped = true;
    };

    if (!track) {
      stop({
        number: item.number,
        status: 'not_started',
        message: `Part ${item.number} was never started. Send book.json to /api/admin/import first.`,
      });
      continue;
    }
    if (track.status === 'ready') {
      outcomes.push({ number: item.number, status: 'already_ready' });
      continue;
    }
    if (track.status === 'processing') {
      stop({ number: item.number, status: 'busy', message: 'This part is being processed.' });
      continue;
    }
    if (track.status === 'failed') {
      stop({
        number: item.number,
        status: 'failed',
        message: track.failureReason ?? 'This part failed. Send book.json again to retry it.',
      });
      continue;
    }

    // uploading: the file has been sent (as one object, or in pieces that still need joining).
    const size = track.sizeBytes ?? 0;
    if (needsMultipart(size)) {
      if (!item.uploadId || !item.etags) {
        stop({
          number: item.number,
          status: 'needs_upload_info',
          message: 'This file was sent in pieces: give "uploadId" and the "etags" of every piece.',
        });
        continue;
      }
      const checked = validateCompletedParts(
        item.etags.map((etag, index) => ({ partNumber: index + 1, etag })),
        partCount(size),
      );
      if (!checked.ok) {
        await abortAndFail(db, storage, track.id, track.r2Key, item.uploadId, OPEN_FAILED);
        changed = true;
        stop({ number: item.number, status: 'failed', message: checked.reason });
        continue;
      }
      try {
        await storage.completeMultipart({
          key: track.r2Key,
          uploadId: item.uploadId,
          parts: checked.parts,
        });
      } catch (error) {
        console.error('Joining the parts of an imported upload failed', error);
        await abortAndFail(db, storage, track.id, track.r2Key, item.uploadId, JOIN_FAILED);
        changed = true;
        stop({ number: item.number, status: 'failed', message: JOIN_FAILED });
        continue;
      }
    }

    const done = await completeTrackUpload(db, track.id, storage.head);
    changed = true;
    if (done.ok) outcomes.push({ number: item.number, status: 'ready' });
    else {
      stop({
        number: item.number,
        status: done.reason === 'wrong_state' ? 'busy' : 'failed',
        message: done.message ?? 'This part can no longer be changed.',
      });
    }
  }

  const allReady = outcomes.every((o) => o.status === 'ready' || o.status === 'already_ready');

  // Publishing is only asked for once every listed part is ready.
  let publish: PublishOutcome = { requested: false };
  if (request.publish) {
    if (!allReady) {
      publish = {
        requested: true,
        published: false,
        message: 'Not published: some parts are not ready.',
      };
    } else {
      const result = await publishBook(db, book.id);
      if (result.ok) {
        publish = { requested: true, published: true };
        changed = true;
      } else if (result.reason === 'incomplete') {
        publish = {
          requested: true,
          published: false,
          missing: result.missing,
          message: `Not published. ${describeMissing(result.missing)}`,
        };
      } else if (result.reason === 'wrong_state') {
        // Already live: asking again is not an error.
        publish = { requested: true, published: true, message: 'The book was already published.' };
      } else {
        publish = { requested: true, published: false, message: 'The book no longer exists.' };
      }
    }
  }

  const [now] = await db.select({ status: books.status }).from(books).where(eq(books.id, book.id));
  return {
    ok: true,
    allReady,
    book: { id: book.id, slug: book.slug, status: now?.status ?? 'draft' },
    parts: outcomes,
    publish,
    changed,
  };
}

/** Throws the sent pieces away and records why the part failed. */
async function abortAndFail(
  db: AdminDb,
  storage: ImportStorage,
  trackId: string,
  key: string,
  uploadId: string,
  reason: string,
) {
  try {
    await storage.abortMultipart({ key, uploadId });
  } catch (error) {
    // The part is marked failed anyway; the bucket drops unfinished uploads on its own.
    console.error('Aborting an imported multipart upload failed', error);
  }
  await failTrackUpload(db, trackId, reason);
}
