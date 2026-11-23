'use server';

import type { BookActionResult } from '@/features/admin/publish/action-types';
import { softDeleteBook } from '@/features/admin/delete-book/data';
import { publishBook, unpublishBook, type PublishResult } from '@/features/admin/publish/data';
import { describeMissing } from '@/features/admin/publish/rules';
import { revalidateCatalogue } from '@/features/admin/revalidate';
import { getAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';

// Server actions are public POST endpoints: every one checks the session itself.
const SESSION_ENDED: BookActionResult = {
  ok: false,
  message: 'Your admin session has ended. Sign in again, then try again.',
};
const GENERIC: BookActionResult = {
  ok: false,
  message: 'Something went wrong. Nothing was changed. Try again in a moment.',
};
const GONE = 'This book no longer exists.';

function publishOutcome(result: PublishResult, wrongState: string): BookActionResult {
  if (result.ok) {
    // Listeners see the change on their next request.
    revalidateCatalogue();
    return { ok: true };
  }
  if (result.reason === 'not_found') return { ok: false, message: GONE };
  if (result.reason === 'incomplete') {
    return { ok: false, message: describeMissing(result.missing), missing: result.missing };
  }
  return { ok: false, message: wrongState };
}

/** Publish now. The rules run on the server against what is saved (`publish/rules.ts`). */
export async function publishBookAction(bookId: string): Promise<BookActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    return publishOutcome(await publishBook(getDb(), bookId), 'This book is already published.');
  } catch (error) {
    console.error('Publishing a book failed', error);
    return GENERIC;
  }
}

/** Back to draft. The first publish date is kept. */
export async function unpublishBookAction(bookId: string): Promise<BookActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    return publishOutcome(await unpublishBook(getDb(), bookId), 'This book is already a draft.');
  } catch (error) {
    console.error('Unpublishing a book failed', error);
    return GENERIC;
  }
}

/** Soft delete behind a typed title (canvas: AdminDelete). The title is checked here too. */
export async function deleteBookAction(
  bookId: string,
  typedTitle: string,
): Promise<BookActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const result = await softDeleteBook(getDb(), bookId, typedTitle);
    if (result.ok) {
      revalidateCatalogue();
      return { ok: true };
    }
    if (result.reason === 'mismatch') {
      return { ok: false, message: 'The title you typed does not match.', mismatch: true };
    }
    return { ok: false, message: GONE };
  } catch (error) {
    console.error('Deleting a book failed', error);
    return GENERIC;
  }
}
