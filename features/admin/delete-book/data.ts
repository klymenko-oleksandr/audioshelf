import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { isUuid } from '../book-form/values';
import type { AdminDb } from '../data/books';
import { confirmationMatches } from './confirmation';

const { books } = schema;

export type SoftDeleteResult =
  { ok: true; title: string } | { ok: false; reason: 'not_found' | 'mismatch' };

/**
 * Soft delete (canvas: AdminDelete): sets `deleted_at`. Nothing else is touched, so the book,
 * its tracks, chapters and files stay and it can be restored in the database. Listeners no
 * longer see it (every catalogue read filters on `deleted_at is null`), and neither do the
 * admin list and edit page. The typed title is checked again here against the stored title.
 */
export async function softDeleteBook(
  db: AdminDb,
  id: string,
  typedTitle: string,
): Promise<SoftDeleteResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' };
  return db.transaction(async (tx): Promise<SoftDeleteResult> => {
    const [book] = await tx
      .select({ id: books.id, title: books.title })
      .from(books)
      .where(and(eq(books.id, id.toLowerCase()), isNull(books.deletedAt)))
      .for('update');
    if (!book) return { ok: false, reason: 'not_found' };
    if (!confirmationMatches(typedTitle, book.title)) return { ok: false, reason: 'mismatch' };
    await tx.update(books).set({ deletedAt: new Date() }).where(eq(books.id, book.id));
    return { ok: true, title: book.title };
  });
}
