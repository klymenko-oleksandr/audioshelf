'use server';

import { redirect } from 'next/navigation';
import type { SaveBookState } from '@/features/admin/book-form/action-state';
import { parseBookForm } from '@/features/admin/book-form/values';
import { saveBook } from '@/features/admin/data/book-form';
import { revalidateCatalogue } from '@/features/admin/revalidate';
import { getAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';

/**
 * Saves the add/edit book form (`bookId` null = a new draft). Server actions are public POST
 * endpoints, so the session is checked here too and never left to `proxy.ts` alone.
 */
export async function saveBookAction(
  bookId: string | null,
  _previous: SaveBookState,
  formData: FormData,
): Promise<SaveBookState> {
  if (!(await getAdminSession())) {
    return {
      status: 'error',
      errors: {},
      message: 'Your admin session has ended. Sign in again, then save.',
    };
  }

  const submitted: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') submitted[key] = value;
  }

  const parsed = parseBookForm(submitted);
  if (!parsed.ok) return { status: 'error', errors: parsed.errors };

  let result;
  try {
    result = await saveBook(getDb(), bookId, parsed.value);
  } catch (error) {
    console.error('Saving a book failed', error);
    return {
      status: 'error',
      errors: {},
      message: 'Could not save the book. Nothing was changed. Try again in a moment.',
    };
  }

  if (!result.ok) {
    return result.reason === 'invalid'
      ? { status: 'error', errors: result.errors }
      : { status: 'error', errors: {}, message: 'This book no longer exists.' };
  }

  // Authors, narrators and the book itself show up in listener pages.
  revalidateCatalogue();

  if (bookId === null) redirect(`/admin/books/${result.id}?created=1`);
  return { status: 'saved', savedAt: result.updatedAt.toISOString(), submitted };
}
