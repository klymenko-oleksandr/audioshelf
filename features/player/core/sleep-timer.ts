/**
 * Sleep timer (PRD): 5–90 minutes or "end of chapter"; the volume fades out over the last
 * 10 s; any manual play or pause cancels it.
 */

export const SLEEP_MINUTE_OPTIONS = [5, 10, 15, 30, 45, 60, 90] as const;
export const SLEEP_FADE_MS = 10_000;

export type SleepTimer =
  /** Stops at a wall-clock time. */
  | { kind: 'minutes'; minutes: number; endsAt: number }
  /** Stops when the chapter that was playing when it was set ends. */
  | { kind: 'endOfChapter'; chapterEnd: number };

export function sleepInMinutes(
  minutes: number,
  now: number,
): Extract<SleepTimer, { kind: 'minutes' }> {
  const clamped = Math.min(
    Math.max(minutes, SLEEP_MINUTE_OPTIONS[0]),
    SLEEP_MINUTE_OPTIONS.at(-1)!,
  );
  return { kind: 'minutes', minutes: clamped, endsAt: now + clamped * 60_000 };
}

export function sleepAtEndOfChapter(
  chapterEnd: number,
): Extract<SleepTimer, { kind: 'endOfChapter' }> {
  return { kind: 'endOfChapter', chapterEnd };
}

/**
 * Wall-clock milliseconds until the timer stops playback.
 * For "end of chapter" that depends on how fast the book is being played.
 */
export function sleepRemainingMs(
  timer: SleepTimer,
  context: { now: number; position: number; speed: number },
): number {
  if (timer.kind === 'minutes') return Math.max(0, timer.endsAt - context.now);
  const speed = context.speed > 0 ? context.speed : 1;
  return Math.max(0, ((timer.chapterEnd - context.position) / speed) * 1000);
}

/** Volume multiplier (0–1) for the fade-out: full until the last 10 s, then linear to 0. */
export function sleepFadeVolume(remainingMs: number): number {
  if (remainingMs >= SLEEP_FADE_MS) return 1;
  return Math.max(0, remainingMs) / SLEEP_FADE_MS;
}

export function sleepExpired(remainingMs: number): boolean {
  return remainingMs <= 0;
}
