import { describe, expect, it } from 'vitest';
import {
  AUTO_REWIND_AFTER_MS,
  AUTO_REWIND_S,
  autoRewindTarget,
  chapterStopTarget,
  isChapterBoundary,
  isFinished,
  nextChapterTarget,
  normalizeSpeed,
  previousChapterTarget,
  progressIn,
  resumePosition,
  seekTarget,
  skipTarget,
  SPEED_PRESETS,
  stepSpeed,
} from './rules';
import type { PlayerChapter } from './types';

const HOUR = 3600;
const chapters: PlayerChapter[] = [
  { id: 'c1', title: 'One', start: 0, end: 600 },
  { id: 'c2', title: 'Two', start: 600, end: 1800 },
  { id: 'c3', title: 'Three', start: 1800, end: 2100 },
];

describe('isFinished — less than 30 s or 2% remaining, whichever is smaller', () => {
  it('uses 30 s for long books (2% of 10 h is 12 min)', () => {
    const duration = 10 * HOUR;
    expect(isFinished(duration - 31, duration)).toBe(false);
    expect(isFinished(duration - 30, duration)).toBe(false);
    expect(isFinished(duration - 29.9, duration)).toBe(true);
    expect(isFinished(duration, duration)).toBe(true);
  });

  it('uses 2% for short books (10 min → 12 s)', () => {
    const duration = 600;
    expect(isFinished(duration - 20, duration)).toBe(false);
    expect(isFinished(duration - 12, duration)).toBe(false);
    expect(isFinished(duration - 11.9, duration)).toBe(true);
  });

  it('switches from 2% to 30 s at 25 minutes', () => {
    const duration = 1500; // 2% = 30 s exactly
    expect(isFinished(duration - 30, duration)).toBe(false);
    expect(isFinished(duration - 29, duration)).toBe(true);
  });

  it('is never finished at the start or with an unknown duration', () => {
    expect(isFinished(0, 600)).toBe(false);
    expect(isFinished(0, 0)).toBe(false);
    expect(isFinished(10, Number.NaN)).toBe(false);
  });
});

describe('resumePosition', () => {
  it('resumes from the saved position', () => {
    expect(resumePosition(1234, 10 * HOUR)).toBe(1234);
  });

  it('starts from the beginning when there is nothing saved', () => {
    expect(resumePosition(undefined, 600)).toBe(0);
    expect(resumePosition(Number.NaN, 600)).toBe(0);
  });

  it('starts a finished book from the beginning', () => {
    expect(resumePosition(10 * HOUR - 5, 10 * HOUR)).toBe(0);
  });

  it('clamps a position past the end (a track got shorter), which then counts as finished', () => {
    expect(resumePosition(5000, 600)).toBe(0);
    expect(resumePosition(-20, 600)).toBe(0);
  });
});

describe('skipTarget', () => {
  it('skips back 15 s and forward 30 s', () => {
    expect(skipTarget(100, -15, 600)).toBe(85);
    expect(skipTarget(100, 30, 600)).toBe(130);
  });

  it('stops at the edges of the book', () => {
    expect(skipTarget(5, -15, 600)).toBe(0);
    expect(skipTarget(590, 30, 600)).toBe(600);
  });
});

describe('previousChapterTarget', () => {
  it('restarts the current chapter when more than 3 s in', () => {
    expect(previousChapterTarget(chapters, 603.1)).toBe(600);
    expect(previousChapterTarget(chapters, 1700)).toBe(600);
  });

  it('goes to the previous chapter within the first 3 s', () => {
    expect(previousChapterTarget(chapters, 600)).toBe(0);
    expect(previousChapterTarget(chapters, 603)).toBe(0);
    expect(previousChapterTarget(chapters, 1801)).toBe(600);
  });

  it('restarts the first chapter either way', () => {
    expect(previousChapterTarget(chapters, 1)).toBe(0);
    expect(previousChapterTarget(chapters, 200)).toBe(0);
  });

  it('pressing it twice quickly goes back a chapter', () => {
    const once = previousChapterTarget(chapters, 1900);
    expect(once).toBe(1800);
    expect(previousChapterTarget(chapters, once + 0.5)).toBe(600);
  });

  it('copes with a book without chapters', () => {
    expect(previousChapterTarget([], 50)).toBe(0);
  });
});

describe('nextChapterTarget', () => {
  it('jumps to the start of the next chapter', () => {
    expect(nextChapterTarget(chapters, 0)).toBe(600);
    expect(nextChapterTarget(chapters, 599.9)).toBe(600);
    expect(nextChapterTarget(chapters, 600)).toBe(1800);
  });

  it('has nowhere to go on the last chapter', () => {
    expect(nextChapterTarget(chapters, 1800)).toBeNull();
    expect(nextChapterTarget(chapters, 2100)).toBeNull();
    expect(nextChapterTarget([], 10)).toBeNull();
  });
});

describe('seekTarget and progressIn', () => {
  const chapter = chapters[1]!;
  const book = { start: 0, end: 2100 };

  it('is chapter-scoped in the full-screen player', () => {
    expect(seekTarget(chapter, 0)).toBe(600);
    expect(seekTarget(chapter, 0.5)).toBe(1200);
    expect(seekTarget(chapter, 1)).toBe(1800);
  });

  it('is book-scoped in the bar', () => {
    expect(seekTarget(book, 0.5)).toBe(1050);
  });

  it('clamps the drag to the bar', () => {
    expect(seekTarget(chapter, -0.2)).toBe(600);
    expect(seekTarget(chapter, 1.7)).toBe(1800);
    expect(seekTarget(chapter, Number.NaN)).toBe(600);
  });

  it('progressIn is the inverse, clamped to 0–1', () => {
    expect(progressIn(chapter, 1200)).toBe(0.5);
    expect(progressIn(chapter, 100)).toBe(0);
    expect(progressIn(chapter, 5000)).toBe(1);
    expect(progressIn({ start: 5, end: 5 }, 5)).toBe(0);
    expect(seekTarget(book, progressIn(book, 777))).toBeCloseTo(777, 6);
  });
});

describe('speed — 0.5× to 3×, 0.1 steps, presets on a 0.05 grid', () => {
  it('keeps every preset as it is', () => {
    for (const preset of SPEED_PRESETS) expect(normalizeSpeed(preset)).toBe(preset);
  });

  it('snaps to the 0.05 grid without floating-point dust', () => {
    expect(normalizeSpeed(1.26)).toBe(1.25);
    expect(normalizeSpeed(1.28)).toBe(1.3);
    expect(normalizeSpeed(0.1 + 0.2 + 0.4)).toBe(0.7);
    expect(normalizeSpeed(1.7000000000000002)).toBe(1.7);
  });

  it('clamps to the allowed range and survives bad input', () => {
    expect(normalizeSpeed(0.1)).toBe(0.5);
    expect(normalizeSpeed(9)).toBe(3);
    expect(normalizeSpeed(Number.NaN)).toBe(1);
  });

  it('steps by 0.1 in both directions, also from a preset like 1.25', () => {
    expect(stepSpeed(1, 1)).toBe(1.1);
    expect(stepSpeed(1, -1)).toBe(0.9);
    expect(stepSpeed(1.25, 1)).toBe(1.35);
    expect(stepSpeed(1.25, -1)).toBe(1.15);
  });

  it('stops at the limits', () => {
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(2.95, 1)).toBe(3);
    expect(stepSpeed(0.5, -1)).toBe(0.5);
  });

  it('walks 0.5 → 3 in exactly 25 clean steps', () => {
    const seen = [0.5];
    while (seen.at(-1)! < 3) seen.push(stepSpeed(seen.at(-1)!, 1));
    expect(seen).toEqual(Array.from({ length: 26 }, (_, i) => Number((0.5 + i * 0.1).toFixed(1))));
  });
});

describe('autoRewindTarget — after a pause of 5 min or more, go back 10 s', () => {
  const MIN = 60_000;
  const base = { position: 1000, pausedAt: 0, now: 5 * MIN, enabled: true };

  it('uses the numbers from the Settings board', () => {
    expect(AUTO_REWIND_AFTER_MS).toBe(5 * MIN);
    expect(AUTO_REWIND_S).toBe(10);
  });

  it('rewinds 10 s after exactly 5 minutes, and not a moment sooner', () => {
    expect(autoRewindTarget(base)).toBe(990);
    expect(autoRewindTarget({ ...base, now: 5 * MIN - 1 })).toBe(1000);
  });

  it('rewinds the same 10 s after a long pause, not more', () => {
    expect(autoRewindTarget({ ...base, now: 3 * 24 * 60 * MIN })).toBe(990);
  });

  it('does nothing when the setting is off', () => {
    expect(autoRewindTarget({ ...base, enabled: false })).toBe(1000);
  });

  it('does nothing when we do not know when playback paused', () => {
    expect(autoRewindTarget({ ...base, pausedAt: undefined })).toBe(1000);
    expect(autoRewindTarget({ ...base, pausedAt: Number.NaN })).toBe(1000);
  });

  it('does nothing when the clock went backwards', () => {
    expect(autoRewindTarget({ ...base, pausedAt: 10 * MIN, now: 5 * MIN })).toBe(1000);
  });

  it('never goes before the start of the book', () => {
    expect(autoRewindTarget({ ...base, position: 4 })).toBe(0);
    expect(autoRewindTarget({ ...base, position: 10 })).toBe(0);
    expect(autoRewindTarget({ ...base, position: 0 })).toBe(0);
  });
});

describe('chapterStopTarget — where to stop when "play next chapter" is off', () => {
  it('is null in the middle of a chapter', () => {
    expect(chapterStopTarget(chapters, 300, 1)).toBeNull();
    expect(chapterStopTarget(chapters, 1000, 1)).toBeNull();
  });

  it('returns the chapter end once it is within a quarter of a second', () => {
    expect(chapterStopTarget(chapters, 599.8, 1)).toBe(600);
    expect(chapterStopTarget(chapters, 1799.76, 1)).toBe(1800);
    expect(chapterStopTarget(chapters, 599.7, 1)).toBeNull();
  });

  it('counts the quarter second in real time, so faster speeds stop earlier in book time', () => {
    expect(chapterStopTarget(chapters, 599.6, 2)).toBe(600); // 0.4 s of book = 0.2 s real
    expect(chapterStopTarget(chapters, 599.6, 1)).toBeNull();
    expect(chapterStopTarget(chapters, 599.9, 0.5)).toBe(600); // 0.1 s of book = 0.2 s real
    expect(chapterStopTarget(chapters, 599.8, 0.5)).toBeNull(); // 0.2 s of book = 0.4 s real
  });

  it('never stops at the end of the last chapter: that is the end of the book', () => {
    expect(chapterStopTarget(chapters, 2099.9, 1)).toBeNull();
  });

  it('has nothing to stop for with one chapter or none', () => {
    expect(chapterStopTarget([chapters[0]!], 599.9, 1)).toBeNull();
    expect(chapterStopTarget([], 5, 1)).toBeNull();
  });

  it('treats a bad speed as 1×', () => {
    expect(chapterStopTarget(chapters, 599.8, 0)).toBe(600);
    expect(chapterStopTarget(chapters, 599.8, Number.NaN)).toBe(600);
  });
});

describe('isChapterBoundary — did a file end where a chapter ends?', () => {
  it('is true at a chapter end and within half a second of it', () => {
    expect(isChapterBoundary(chapters, 600)).toBe(true);
    expect(isChapterBoundary(chapters, 599.6)).toBe(true);
    expect(isChapterBoundary(chapters, 600.4)).toBe(true);
    expect(isChapterBoundary(chapters, 1800)).toBe(true);
  });

  it('is false elsewhere, at the start of the book, and at the end of the last chapter', () => {
    expect(isChapterBoundary(chapters, 300)).toBe(false);
    expect(isChapterBoundary(chapters, 601)).toBe(false);
    expect(isChapterBoundary(chapters, 0)).toBe(false);
    expect(isChapterBoundary(chapters, 2100)).toBe(false);
  });
});
