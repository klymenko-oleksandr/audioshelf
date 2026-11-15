'use client';

import { toast } from '@/components/ui/toast';
import { loadPlayerBook } from './data/load-book';
import { getPlayer } from './player';

/**
 * Play a book from a card or a page: fetch its tracks, then start. Resumes from the saved
 * position unless `position` is given (a chapter was tapped). Says so when the book cannot
 * be loaded; the text comes from the caller, which has the translations.
 */
export async function playBook(
  bookId: string,
  messages: { failed: string },
  position?: number,
): Promise<void> {
  try {
    const book = await loadPlayerBook(bookId);
    if (!book) throw new Error('Book is not available');
    getPlayer().start(book, position);
  } catch {
    toast({ title: messages.failed, variant: 'error' });
  }
}
