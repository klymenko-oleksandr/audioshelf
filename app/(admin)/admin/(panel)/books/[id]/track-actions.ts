'use server';

import type { AdminDb } from '@/features/admin/data/books';
import {
  beginTrackUpload,
  completeTrackUpload,
  failTrackUpload,
  getBookTracks,
  getUploadingTrack,
  removeTrack,
  renameChapter,
  renameTrack,
  reorderTracks,
  restartTrackUpload,
  type BeginResult,
  type UploadInput,
} from '@/features/admin/tracks/data';
import {
  needsMultipart,
  partCount,
  validateCompletedParts,
  PART_SIZE_BYTES,
  type CompletedPart,
} from '@/features/admin/tracks/multipart';
import type { PartUrlsResult, TrackActionResult } from '@/features/admin/tracks/action-types';
import { revalidateCatalogue } from '@/features/admin/revalidate';
import { getAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createPartUploadUrls,
  createUploadUrl,
  headObject,
} from '@/lib/r2/client';

// Server actions are public POST endpoints: every one checks the session itself.
const SESSION_ENDED_MESSAGE = 'Your admin session has ended. Sign in again, then try again.';
const SESSION_ENDED: TrackActionResult = { ok: false, message: SESSION_ENDED_MESSAGE };
const GENERIC = 'Something went wrong. Nothing was changed. Try again in a moment.';

async function snapshotOf(db: AdminDb, bookId: string) {
  return getBookTracks(db, bookId);
}

function beginMessage(result: Extract<BeginResult, { ok: false }>): string {
  if (result.message) return result.message;
  return result.reason === 'book_missing'
    ? 'This book no longer exists.'
    : 'This part can no longer be changed. Reload the page.';
}

async function presign(
  db: AdminDb,
  bookId: string,
  begun: Extract<BeginResult, { ok: true }>,
  fileSize: number,
): Promise<TrackActionResult> {
  try {
    if (needsMultipart(fileSize)) {
      // Over 100 MB: open a multipart upload; the browser sends the parts and joins them.
      const { uploadId } = await createMultipartUpload({
        key: begun.key,
        contentType: begun.mimeType,
      });
      revalidateCatalogue();
      return {
        ok: true,
        snapshot: await snapshotOf(db, bookId),
        trackId: begun.trackId,
        multipart: { uploadId, partSize: PART_SIZE_BYTES, partCount: partCount(fileSize) },
      };
    }
    const upload = await createUploadUrl({ key: begun.key, contentType: begun.mimeType });
    revalidateCatalogue();
    return { ok: true, snapshot: await snapshotOf(db, bookId), trackId: begun.trackId, upload };
  } catch (error) {
    console.error('Preparing an upload failed', error);
    await failTrackUpload(db, begun.trackId, 'Could not prepare the upload.');
    return {
      ok: false,
      message: 'Could not prepare the upload. Try again.',
      snapshot: await snapshotOf(db, bookId),
    };
  }
}

/** Step 1: add the part and get the one-time address to send the file to. */
export async function startTrackUploadAction(
  bookId: string,
  input: UploadInput,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const begun = await beginTrackUpload(db, { ...input, bookId });
    if (!begun.ok) return { ok: false, message: beginMessage(begun) };
    return await presign(db, bookId, begun, input.file.size);
  } catch (error) {
    console.error('Starting a track upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

/** Retry for a failed part: start over with a file, keeping the part's place and title. */
export async function restartTrackUploadAction(
  bookId: string,
  trackId: string,
  input: UploadInput,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const begun = await restartTrackUpload(db, trackId, input);
    if (!begun.ok) return { ok: false, message: beginMessage(begun) };
    return await presign(db, bookId, begun, input.file.size);
  } catch (error) {
    console.error('Restarting a track upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

/** The browser could not send the file: record why. */
export async function failTrackUploadAction(
  bookId: string,
  trackId: string,
  reason: string,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    await failTrackUpload(db, trackId, reason);
    revalidateCatalogue();
    return { ok: true, snapshot: await snapshotOf(db, bookId) };
  } catch (error) {
    console.error('Recording a failed upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

/** Checks the stored object and makes the part ready; shared by the single and multipart paths. */
async function finish(db: AdminDb, bookId: string, trackId: string): Promise<TrackActionResult> {
  const result = await completeTrackUpload(db, trackId, headObject);
  revalidateCatalogue();
  const snapshot = await snapshotOf(db, bookId);
  if (result.ok) return { ok: true, snapshot };
  return {
    ok: false,
    message: result.message ?? 'This part can no longer be changed. Reload the page.',
    snapshot,
  };
}

/** Step 2: the file has been sent. Check it in storage and make the part ready. */
export async function completeTrackUploadAction(
  bookId: string,
  trackId: string,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    return await finish(getDb(), bookId, trackId);
  } catch (error) {
    console.error('Completing a track upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

const NOT_UPLOADING = 'This upload is no longer in progress. Reload the page.';
const validUploadId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024;

/** Multipart step 2: one presigned address per part of the file the browser is about to send. */
export async function getPartUrlsAction(
  bookId: string,
  trackId: string,
  uploadId: string,
): Promise<PartUrlsResult> {
  if (!(await getAdminSession())) return { ok: false, message: SESSION_ENDED_MESSAGE };
  try {
    const target = validUploadId(uploadId)
      ? await getUploadingTrack(getDb(), bookId, trackId)
      : null;
    if (!target || !needsMultipart(target.sizeBytes)) return { ok: false, message: NOT_UPLOADING };
    const urls = await createPartUploadUrls({
      key: target.key,
      uploadId,
      partCount: partCount(target.sizeBytes),
    });
    return { ok: true, urls };
  } catch (error) {
    console.error('Preparing the part addresses failed', error);
    return { ok: false, message: 'Could not prepare the upload. Try again.' };
  }
}

/** Throws the sent parts away and marks the part failed, with the reason shown in the list. */
async function abortAndFail(
  db: AdminDb,
  trackId: string,
  key: string,
  uploadId: string,
  reason: string,
) {
  try {
    await abortMultipartUpload({ key, uploadId });
  } catch (error) {
    // The part is marked failed anyway; storage drops unfinished uploads on its own after a week.
    console.error('Aborting a multipart upload failed', error);
  }
  await failTrackUpload(db, trackId, reason);
}

/**
 * Multipart step 3: the browser has sent every part. Join them in storage, then check the object
 * and make the part ready, exactly as for a file sent in one request.
 */
export async function completeMultipartUploadAction(
  bookId: string,
  trackId: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const target = validUploadId(uploadId) ? await getUploadingTrack(db, bookId, trackId) : null;
    if (!target)
      return { ok: false, message: NOT_UPLOADING, snapshot: await snapshotOf(db, bookId) };

    const checked = validateCompletedParts(
      Array.isArray(parts) ? parts : [],
      partCount(target.sizeBytes),
    );
    if (!checked.ok) {
      await abortAndFail(
        db,
        trackId,
        target.key,
        uploadId,
        'The parts of the upload were incomplete.',
      );
      revalidateCatalogue();
      return { ok: false, message: checked.reason, snapshot: await snapshotOf(db, bookId) };
    }
    try {
      await completeMultipartUpload({ key: target.key, uploadId, parts: checked.parts });
    } catch (error) {
      console.error('Joining the parts of an upload failed', error);
      const message = 'Storage could not join the parts of the file. Try again.';
      await abortAndFail(db, trackId, target.key, uploadId, message);
      revalidateCatalogue();
      return { ok: false, message, snapshot: await snapshotOf(db, bookId) };
    }
    return await finish(db, bookId, trackId);
  } catch (error) {
    console.error('Completing a multipart upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

/** The upload failed or was cancelled: abort it in storage and record why. */
export async function abortMultipartUploadAction(
  bookId: string,
  trackId: string,
  uploadId: string,
  reason: string,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const target = validUploadId(uploadId) ? await getUploadingTrack(db, bookId, trackId) : null;
    if (target) {
      await abortAndFail(
        db,
        trackId,
        target.key,
        uploadId,
        String(reason ?? '').slice(0, 300) || 'The upload failed.',
      );
      revalidateCatalogue();
    }
    return { ok: true, snapshot: await snapshotOf(db, bookId) };
  } catch (error) {
    console.error('Aborting a multipart upload failed', error);
    return { ok: false, message: GENERIC };
  }
}

async function change(
  bookId: string,
  run: (db: AdminDb) => Promise<{ ok: true } | { ok: false; reason: string }>,
  refusals: Record<string, string>,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const result = await run(db);
    if (!result.ok) {
      return {
        ok: false,
        message: refusals[result.reason] ?? GENERIC,
        snapshot: await snapshotOf(db, bookId),
      };
    }
    revalidateCatalogue();
    return { ok: true, snapshot: await snapshotOf(db, bookId) };
  } catch (error) {
    console.error('Changing a track failed', error);
    return { ok: false, message: GENERIC };
  }
}

const NAME_REFUSALS = {
  invalid: 'Enter a name of up to 200 characters.',
  missing: 'This item no longer exists. Reload the page.',
};

export async function renameTrackAction(bookId: string, trackId: string, title: string) {
  return change(bookId, (db) => renameTrack(db, trackId, title), NAME_REFUSALS);
}

export async function renameChapterAction(bookId: string, chapterId: string, title: string) {
  return change(bookId, (db) => renameChapter(db, chapterId, title), NAME_REFUSALS);
}

export async function removeTrackAction(bookId: string, trackId: string) {
  return change(bookId, (db) => removeTrack(db, trackId), {
    missing: 'This part no longer exists. Reload the page.',
    published: 'A part of a published book cannot be removed. Unpublish the book first.',
  });
}

/** Puts the parts of a draft in a new order; the chapters are rebuilt from it. */
export async function reorderTracksAction(bookId: string, orderedIds: string[]) {
  return change(
    bookId,
    (db) => reorderTracks(db, bookId, Array.isArray(orderedIds) ? orderedIds : []),
    {
      missing: 'This book no longer exists. Reload the page.',
      published: 'The order of a published book cannot be changed. Unpublish the book first.',
      mismatch: 'The list of parts changed. Reload the page and try again.',
    },
  );
}
