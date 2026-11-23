import { and, count, eq, isNull } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { isUuid } from '../book-form/values';
import type { AdminDb } from '../data/books';
import { canPublishFrom, canUnpublishFrom, findMissing, type Requirement } from './rules';

const { books, tracks } = schema;

export type PublishResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_state' }
  | { ok: false; reason: 'incomplete'; missing: Requirement[] };

type Tx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];

/** Locks the book row so two clicks (or a save and a click) cannot interleave. */
async function lockBook(tx: Tx, id: string) {
  const [book] = await tx
    .select({
      id: books.id,
      title: books.title,
      status: books.status,
      authorId: books.authorId,
      categoryId: books.categoryId,
      narratorId: books.narratorId,
      publishedAt: books.publishedAt,
    })
    .from(books)
    .where(and(eq(books.id, id.toLowerCase()), isNull(books.deletedAt)))
    .for('update');
  return book;
}

/**
 * Publish now. The rules are checked here, inside the transaction, against what is stored, so
 * a browser that thinks the book is complete cannot publish an incomplete one.
 * `published_at` is the first time the book went live: it is set once and never overwritten.
 */
export async function publishBook(db: AdminDb, id: string): Promise<PublishResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' };
  return db.transaction(async (tx): Promise<PublishResult> => {
    const book = await lockBook(tx, id);
    if (!book) return { ok: false, reason: 'not_found' };
    if (!canPublishFrom(book.status)) return { ok: false, reason: 'wrong_state' };

    const [{ ready } = { ready: 0 }] = await tx
      .select({ ready: count() })
      .from(tracks)
      .where(and(eq(tracks.bookId, book.id), eq(tracks.status, 'ready')));
    const missing = findMissing({
      title: book.title,
      hasAuthor: book.authorId !== null,
      hasCategory: book.categoryId !== null,
      hasNarrator: book.narratorId !== null,
      readyTracks: ready,
    });
    if (missing.length > 0) return { ok: false, reason: 'incomplete', missing };

    await tx
      .update(books)
      .set({ status: 'published', publishAt: null, publishedAt: book.publishedAt ?? new Date() })
      .where(eq(books.id, book.id));
    return { ok: true };
  });
}

/** Back to draft (unpublish, or cancel a schedule). The publish date stays. */
export async function unpublishBook(db: AdminDb, id: string): Promise<PublishResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' };
  return db.transaction(async (tx): Promise<PublishResult> => {
    const book = await lockBook(tx, id);
    if (!book) return { ok: false, reason: 'not_found' };
    if (!canUnpublishFrom(book.status)) return { ok: false, reason: 'wrong_state' };
    await tx.update(books).set({ status: 'draft', publishAt: null }).where(eq(books.id, book.id));
    return { ok: true };
  });
}
