/**
 * Chapters are named ranges of book time, independent of tracks (ADR 3). Adding a track adds
 * one chapter by default, starting where the book currently ends, so nothing already there moves.
 */
export function nextChapterRange(
  bookEndSeconds: number,
  trackSeconds: number,
): { startSeconds: number; endSeconds: number } {
  if (!Number.isFinite(bookEndSeconds) || bookEndSeconds < 0) {
    throw new Error(`Invalid book end: ${bookEndSeconds}`);
  }
  if (!Number.isFinite(trackSeconds) || trackSeconds < 0) {
    throw new Error(`Invalid track length: ${trackSeconds}`);
  }
  return { startSeconds: bookEndSeconds, endSeconds: bookEndSeconds + trackSeconds };
}

/** Where the book ends: the latest chapter end, or 0 when there are no chapters. */
export const bookEnd = (chapters: { endSeconds: number }[]) =>
  chapters.reduce((end, c) => Math.max(end, c.endSeconds), 0);

/** `books.duration_seconds`: the sum of the tracks that are ready. */
export const bookDurationSeconds = (tracks: { status: string; durationSeconds: number }[]) =>
  tracks.reduce((sum, t) => (t.status === 'ready' ? sum + t.durationSeconds : sum), 0);

/** The stored object must be exactly as large as the file the browser said it sent. */
export const sizeMatches = (declaredBytes: number, storedBytes: number) =>
  declaredBytes === storedBytes;

export interface ChapterRange {
  id: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Where a track begins in book time: the total length of the ready tracks before it. Tracks
 * play in `position` order, and only ready ones are part of the book.
 */
export function trackStartSeconds(
  tracks: { id: string; position: number; status: string; durationSeconds: number }[],
  trackId: string,
): number {
  const target = tracks.find((t) => t.id === trackId);
  if (!target) return 0;
  return tracks
    .filter((t) => t.status === 'ready' && t.position < target.position)
    .reduce((sum, t) => sum + t.durationSeconds, 0);
}

/**
 * Makes room for `length` seconds of new audio at book time `at`: chapters from there on move
 * back, a chapter the new audio lands inside gets longer. Appending at the end moves nothing.
 */
export function insertTime<T extends ChapterRange>(chapters: T[], at: number, length: number): T[] {
  return chapters.map((c) => ({
    ...c,
    startSeconds: c.startSeconds >= at ? c.startSeconds + length : c.startSeconds,
    endSeconds: c.endSeconds > at ? c.endSeconds + length : c.endSeconds,
  }));
}

/**
 * Takes the audio between `from` and `to` out of the book: later chapters move forward, ones
 * that overlap it get shorter, and ones that lay entirely inside it go away.
 */
export function cutTime<T extends ChapterRange>(chapters: T[], from: number, to: number): T[] {
  const removed = to - from;
  const map = (t: number) => (t <= from ? t : t >= to ? t - removed : from);
  return chapters
    .map((c) => ({ ...c, startSeconds: map(c.startSeconds), endSeconds: map(c.endSeconds) }))
    .filter(
      (c, i) =>
        c.endSeconds > c.startSeconds || chapters[i]!.endSeconds === chapters[i]!.startSeconds,
    );
}
