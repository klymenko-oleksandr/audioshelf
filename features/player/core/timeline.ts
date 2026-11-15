import type { PlayerBook, PlayerChapter, PlayerTrack } from './types';

/**
 * Book time ↔ track + offset.
 *
 * Position is stored and synced as book time, never as track + offset, so re-uploading or
 * appending tracks does not invalidate saved positions (PRD: Player → Model).
 */
export interface Timeline {
  /** Book time at which each track starts. */
  starts: number[];
  durations: number[];
  /** Total length of the book. */
  duration: number;
}

export interface TrackPosition {
  trackIndex: number;
  /** Seconds from the start of that track. */
  offset: number;
}

export function buildTimeline(tracks: readonly Pick<PlayerTrack, 'duration'>[]): Timeline {
  const starts: number[] = [];
  const durations: number[] = [];
  let total = 0;
  for (const track of tracks) {
    starts.push(total);
    durations.push(track.duration);
    total += track.duration;
  }
  return { starts, durations, duration: total };
}

export function clampToBook(timeline: Timeline, bookTime: number): number {
  if (!Number.isFinite(bookTime)) return 0;
  return Math.min(Math.max(bookTime, 0), timeline.duration);
}

/**
 * Which track plays at `bookTime`, and where in it.
 * A time exactly on a boundary belongs to the track that starts there; the very end of the
 * book is the end of the last track.
 */
export function locate(timeline: Timeline, bookTime: number): TrackPosition {
  const count = timeline.starts.length;
  if (count === 0) return { trackIndex: 0, offset: 0 };

  const time = clampToBook(timeline, bookTime);
  let index = count - 1;
  for (let i = 0; i < count; i++) {
    if (time < timeline.starts[i]! + timeline.durations[i]!) {
      index = i;
      break;
    }
  }
  return { trackIndex: index, offset: time - timeline.starts[index]! };
}

export function toBookTime(timeline: Timeline, trackIndex: number, offset: number): number {
  const count = timeline.starts.length;
  if (count === 0) return 0;
  const index = Math.min(Math.max(Math.trunc(trackIndex), 0), count - 1);
  const within = Math.min(Math.max(offset, 0), timeline.durations[index]!);
  return timeline.starts[index]! + within;
}

/** Index of the chapter that contains `bookTime` (the last one at or past the end). */
export function chapterIndexAt(chapters: readonly PlayerChapter[], bookTime: number): number {
  if (chapters.length === 0) return -1;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (bookTime >= chapters[i]!.start) return i;
  }
  return 0;
}

/** Default chapters: one per track, titled by the caller (admin can rename them later). */
export function chaptersFromTracks(
  tracks: readonly PlayerTrack[],
  titleFor: (index: number) => string,
): PlayerChapter[] {
  const timeline = buildTimeline(tracks);
  return tracks.map((track, index) => ({
    id: track.id,
    title: titleFor(index),
    start: timeline.starts[index]!,
    end: timeline.starts[index]! + track.duration,
  }));
}

/**
 * Problems that would make a book unplayable or its chapters ambiguous.
 * Empty array = fine. Used for static data now and by the admin import later.
 */
export function validateBook(book: Pick<PlayerBook, 'tracks' | 'chapters'>): string[] {
  const problems: string[] = [];
  const { tracks, chapters } = book;

  if (tracks.length === 0) problems.push('The book has no tracks.');
  tracks.forEach((track, i) => {
    if (!(track.duration > 0)) problems.push(`Track ${i + 1} has no duration.`);
    if (!track.url) problems.push(`Track ${i + 1} has no URL.`);
  });

  const { duration } = buildTimeline(tracks);
  const tolerance = 0.5; // durations come from file metadata and rarely add up exactly

  if (chapters.length === 0) {
    problems.push('The book has no chapters.');
    return problems;
  }
  if (Math.abs(chapters[0]!.start) > tolerance) problems.push('The first chapter must start at 0.');
  chapters.forEach((chapter, i) => {
    if (!(chapter.end > chapter.start)) problems.push(`Chapter ${i + 1} is empty or reversed.`);
    const next = chapters[i + 1];
    if (next && Math.abs(next.start - chapter.end) > tolerance) {
      problems.push(`Chapters ${i + 1} and ${i + 2} overlap or leave a gap.`);
    }
  });
  if (Math.abs(chapters.at(-1)!.end - duration) > tolerance) {
    problems.push('The last chapter must end where the audio ends.');
  }
  return problems;
}
