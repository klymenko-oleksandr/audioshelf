'use server';

import type { AdminDb } from '@/features/admin/data/books';
import {
  beginTrackUpload,
  completeTrackUpload,
  failTrackUpload,
  getBookTracks,
  removeTrack,
  renameChapter,
  renameTrack,
  restartTrackUpload,
  type BeginResult,
  type UploadInput,
} from '@/features/admin/tracks/data';
import type { TrackActionResult } from '@/features/admin/tracks/action-types';
import { revalidateCatalogue } from '@/features/admin/revalidate';
import { getAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';
import { createUploadUrl, headObject } from '@/lib/r2/client';

// Server actions are public POST endpoints: every one checks the session itself.
const SESSION_ENDED: TrackActionResult = {
  ok: false,
  message: 'Your admin session has ended. Sign in again, then try again.',
};
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
): Promise<TrackActionResult> {
  try {
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
    return await presign(db, bookId, begun);
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
    return await presign(db, bookId, begun);
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

/** Step 2: the file has been sent. Check it in storage and make the part ready. */
export async function completeTrackUploadAction(
  bookId: string,
  trackId: string,
): Promise<TrackActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const db = getDb();
    const result = await completeTrackUpload(db, trackId, headObject);
    revalidateCatalogue();
    const snapshot = await snapshotOf(db, bookId);
    if (result.ok) return { ok: true, snapshot };
    return {
      ok: false,
      message: result.message ?? 'This part can no longer be changed. Reload the page.',
      snapshot,
    };
  } catch (error) {
    console.error('Completing a track upload failed', error);
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
