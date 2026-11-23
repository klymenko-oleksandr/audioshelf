/**
 * Pure helpers that turn saved progress into what the catalogue screens show:
 * the "Continue listening" row and the played state of a chapter list.
 */

interface SavedProgress {
  bookId: string;
  position: number;
  finished: boolean;
  updatedAt: number;
  /** The listener removed the book from Continue listening at this time. */
  dismissedAt?: number;
}

/**
 * Books for "Continue listening": started, not finished, not removed by the listener, most
 * recent first (PRD: Home — a book leaves the row when it is finished or removed). Playing a
 * removed book again saves a fresh record without `dismissedAt`, which brings it back.
 */
export function pickContinue<T extends SavedProgress>(records: readonly T[], limit: number): T[] {
  return records
    .filter((record) => !record.finished && record.position > 0 && record.dismissedAt === undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

/** Index of the chapter that contains `position`, given where each chapter starts. */
export function chapterIndexFor(starts: readonly number[], position: number): number {
  if (starts.length === 0) return -1;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (position >= starts[i]!) return i;
  }
  return 0;
}

export type ChapterState = 'done' | 'current' | 'upcoming';

/**
 * Played state per chapter for the book page.
 * `current` is the chapter the listener is in (-1 when the book was never started);
 * everything before it is done. A finished book has every chapter done.
 */
export function chapterStates(count: number, current: number, finished: boolean): ChapterState[] {
  return Array.from({ length: count }, (_, index) => {
    if (finished) return 'done';
    if (current < 0) return 'upcoming';
    return index < current ? 'done' : index === current ? 'current' : 'upcoming';
  });
}

/** Whole percent listened, never 0 for a started book and never 100 before the end. */
export function percentListened(position: number, duration: number): number {
  if (!(duration > 0) || !(position > 0)) return 0;
  return Math.min(99, Math.max(1, Math.round((position / duration) * 100)));
}
