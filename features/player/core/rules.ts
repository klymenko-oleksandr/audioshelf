import { chapterIndexAt } from './timeline';
import type { PlayerChapter } from './types';

/** Player rules from the PRD (Player → Controls and rules). Pure functions, book time in s. */

/** Fallbacks only; the real intervals come from Settings (features/settings). */
export const DEFAULT_SKIP_BACK_S = 15;
export const DEFAULT_SKIP_FORWARD_S = 30;

/** "Previous chapter" restarts the current chapter when more than this far into it. */
export const PREVIOUS_RESTARTS_AFTER_S = 3;

export const FINISHED_REMAINING_S = 30;
export const FINISHED_REMAINING_FRACTION = 0.02;

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
export const SPEED_STEP = 0.1;
export const SPEED_GRID = 0.05;
export const DEFAULT_SPEED = 1;
export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * A book counts as finished when less than 30 s or 2% remain, whichever is smaller.
 * (So a 10-minute book needs to get within 12 s of the end, a long one within 30 s.)
 */
export function isFinished(position: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  const threshold = Math.min(FINISHED_REMAINING_S, duration * FINISHED_REMAINING_FRACTION);
  return duration - position < threshold;
}

/**
 * Is it time to write "finished" into History (PRD: a book counts as finished when less than
 * 30 s or 2% remain)? True at the real end, or inside that zone while the book is *playing*,
 * so a position dragged there on a paused book does not count. Ongoing books are never
 * finished: more parts are coming. The caller reports it once per play.
 */
export function historyFinishDue(input: {
  ongoing: boolean;
  position: number;
  duration: number;
  /** Playback is running (playing, buffering or loading). */
  playing: boolean;
  /** The book played to its last second. */
  ended: boolean;
}): boolean {
  if (input.ongoing || !(input.duration > 0)) return false;
  if (input.ended) return true;
  return input.playing && isFinished(input.position, input.duration);
}

/** Where Play starts: the saved position, or the beginning once the book is finished. */
export function resumePosition(saved: number | undefined, duration: number): number {
  if (saved === undefined || !Number.isFinite(saved)) return 0;
  const position = clamp(saved, 0, duration);
  return isFinished(position, duration) ? 0 : position;
}

/** Skip back (negative) or forward (positive), staying inside the book. */
export function skipTarget(position: number, deltaSeconds: number, duration: number): number {
  return clamp(position + deltaSeconds, 0, duration);
}

/**
 * Previous chapter: restart the current chapter if more than 3 s in, otherwise go to the
 * start of the previous one (the first chapter just restarts).
 */
export function previousChapterTarget(
  chapters: readonly PlayerChapter[],
  position: number,
): number {
  const index = chapterIndexAt(chapters, position);
  if (index < 0) return 0;
  const current = chapters[index]!;
  if (position - current.start > PREVIOUS_RESTARTS_AFTER_S || index === 0) return current.start;
  return chapters[index - 1]!.start;
}

/** Start of the next chapter, or `null` on the last one. */
export function nextChapterTarget(
  chapters: readonly PlayerChapter[],
  position: number,
): number | null {
  const index = chapterIndexAt(chapters, position);
  return chapters[index + 1]?.start ?? null;
}

/**
 * Seeking by dragging the progress bar: chapter-scoped in the full-screen player,
 * book-scoped in the bar. `fraction` is 0–1 along the bar.
 */
export function seekTarget(scope: { start: number; end: number }, fraction: number): number {
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0;
  return scope.start + (scope.end - scope.start) * f;
}

/** 0–1 progress of `position` through a range (a chapter or the whole book). */
export function progressIn(scope: { start: number; end: number }, position: number): number {
  const length = scope.end - scope.start;
  if (!(length > 0)) return 0;
  return clamp((position - scope.start) / length, 0, 1);
}

/**
 * Speed: 0.5× to 3×. The slower / faster buttons move in 0.1 steps (PRD); the canvas presets
 * include 1.25× and 1.75×, so values are kept on a 0.05 grid rather than snapped to tenths.
 */
export function normalizeSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  const snapped = Math.round(speed / SPEED_GRID) * SPEED_GRID;
  return Number(clamp(snapped, MIN_SPEED, MAX_SPEED).toFixed(2));
}

export function stepSpeed(speed: number, direction: 1 | -1): number {
  return normalizeSpeed(normalizeSpeed(speed) + direction * SPEED_STEP);
}

/** Smart rewind (Settings board): after a pause this long, resume a little earlier. */
export const AUTO_REWIND_AFTER_MS = 5 * 60 * 1000;
export const AUTO_REWIND_S = 10;

/**
 * Where to resume after a pause. With auto-rewind on, a pause of 5 minutes or more takes
 * the position back 10 s (never before the start). Anything we cannot trust — no pause
 * time, a clock that went backwards — leaves the position alone.
 */
export function autoRewindTarget(input: {
  position: number;
  /** When playback paused, ms since epoch; `undefined` if unknown. */
  pausedAt: number | undefined;
  now: number;
  enabled: boolean;
}): number {
  const { position, pausedAt, now, enabled } = input;
  if (!enabled || pausedAt === undefined || !Number.isFinite(pausedAt)) return position;
  if (now - pausedAt < AUTO_REWIND_AFTER_MS) return position;
  return Math.max(0, position - AUTO_REWIND_S);
}

/** How far ahead of a chapter end to stop, in real seconds (the time cannot be hit exactly). */
export const CHAPTER_STOP_LOOKAHEAD_S = 0.25;
/** A file that ends this close to a chapter end counts as ending at it. */
export const CHAPTER_BOUNDARY_TOLERANCE_S = 0.5;

/**
 * "Play next chapter" is off: the chapter end to stop at, once playback is within a quarter
 * of a second (real time) of it; otherwise `null`. The last chapter has no next one — that
 * is the end of the book and is handled as such.
 */
export function chapterStopTarget(
  chapters: readonly PlayerChapter[],
  position: number,
  speed: number,
): number | null {
  const index = chapterIndexAt(chapters, position);
  if (index < 0 || index >= chapters.length - 1) return null;
  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const end = chapters[index]!.end;
  return (end - position) / rate <= CHAPTER_STOP_LOOKAHEAD_S ? end : null;
}

/** True when `time` is where a chapter other than the last one ends (± half a second). */
export function isChapterBoundary(chapters: readonly PlayerChapter[], time: number): boolean {
  return chapters
    .slice(0, -1)
    .some((chapter) => Math.abs(chapter.end - time) <= CHAPTER_BOUNDARY_TOLERANCE_S);
}
