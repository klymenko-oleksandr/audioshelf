import { describe, expect, it } from 'vitest';
import {
  bookDurationSeconds,
  bookEnd,
  cutTime,
  insertTime,
  nextChapterRange,
  sizeMatches,
  trackStartSeconds,
  type ChapterRange,
} from './chapters';

describe('nextChapterRange', () => {
  it('starts the first chapter at 0', () => {
    expect(nextChapterRange(0, 600)).toEqual({ startSeconds: 0, endSeconds: 600 });
  });

  it('starts each new chapter where the book ends now', () => {
    expect(nextChapterRange(600, 450.5)).toEqual({ startSeconds: 600, endSeconds: 1050.5 });
  });

  it('keeps a track that reports no length as an empty range at the end', () => {
    expect(nextChapterRange(600, 0)).toEqual({ startSeconds: 600, endSeconds: 600 });
  });

  it('refuses a negative or non-finite length', () => {
    expect(() => nextChapterRange(0, -1)).toThrow();
    expect(() => nextChapterRange(0, Number.NaN)).toThrow();
    expect(() => nextChapterRange(-5, 10)).toThrow();
  });
});

describe('bookEnd', () => {
  it('is the end of the last chapter, or 0 without chapters', () => {
    expect(bookEnd([])).toBe(0);
    expect(bookEnd([{ endSeconds: 10 }, { endSeconds: 30 }, { endSeconds: 20 }])).toBe(30);
  });
});

describe('bookDurationSeconds', () => {
  it('adds up the ready tracks only', () => {
    expect(
      bookDurationSeconds([
        { status: 'ready', durationSeconds: 100 },
        { status: 'ready', durationSeconds: 50.5 },
        { status: 'failed', durationSeconds: 999 },
        { status: 'uploading', durationSeconds: 999 },
        { status: 'processing', durationSeconds: 999 },
      ]),
    ).toBe(150.5);
  });

  it('is 0 without ready tracks', () => {
    expect(bookDurationSeconds([])).toBe(0);
  });
});

describe('sizeMatches', () => {
  it('is true only for the exact size', () => {
    expect(sizeMatches(1000, 1000)).toBe(true);
    expect(sizeMatches(1000, 999)).toBe(false);
    expect(sizeMatches(1000, 0)).toBe(false);
  });
});

const ch = (id: string, start: number, end: number): ChapterRange => ({
  id,
  startSeconds: start,
  endSeconds: end,
});

describe('trackStartSeconds', () => {
  const tracks = [
    { id: 'a', position: 1, status: 'ready', durationSeconds: 100 },
    { id: 'b', position: 2, status: 'failed', durationSeconds: 70 },
    { id: 'c', position: 3, status: 'ready', durationSeconds: 50 },
    { id: 'd', position: 4, status: 'ready', durationSeconds: 25 },
  ];

  it('is the total length of the ready tracks before it, by position', () => {
    expect(trackStartSeconds(tracks, 'a')).toBe(0);
    expect(trackStartSeconds(tracks, 'c')).toBe(100);
    expect(trackStartSeconds(tracks, 'd')).toBe(150);
  });

  it('does not depend on the order of the list', () => {
    expect(trackStartSeconds([...tracks].reverse(), 'd')).toBe(150);
  });

  it('is 0 for an unknown track', () => {
    expect(trackStartSeconds(tracks, 'zzz')).toBe(0);
  });
});

describe('insertTime', () => {
  it('appending at the end moves nothing', () => {
    const before = [ch('a', 0, 100), ch('b', 100, 150)];
    expect(insertTime(before, 150, 40)).toEqual(before);
  });

  it('pushes later chapters back by the inserted length', () => {
    expect(insertTime([ch('a', 0, 100), ch('b', 100, 150)], 100, 40)).toEqual([
      ch('a', 0, 100),
      ch('b', 140, 190),
    ]);
  });

  it('stretches a chapter that the new time lands inside', () => {
    expect(insertTime([ch('a', 0, 100), ch('b', 100, 150)], 120, 40)).toEqual([
      ch('a', 0, 100),
      ch('b', 100, 190),
    ]);
  });
});

describe('cutTime', () => {
  it('pulls later chapters forward by the removed length', () => {
    expect(cutTime([ch('a', 0, 100), ch('b', 100, 150), ch('c', 150, 175)], 100, 150)).toEqual([
      ch('a', 0, 100),
      ch('c', 100, 125),
    ]);
  });

  it('drops a chapter that lay entirely inside the removed time', () => {
    const result = cutTime([ch('a', 0, 100), ch('b', 100, 150)], 100, 150);
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('shortens a chapter that overlaps the removed time', () => {
    expect(cutTime([ch('a', 0, 120)], 100, 150)).toEqual([ch('a', 0, 100)]);
    expect(cutTime([ch('a', 120, 200)], 100, 150)).toEqual([ch('a', 100, 150)]);
    expect(cutTime([ch('a', 0, 200)], 100, 150)).toEqual([ch('a', 0, 150)]);
  });

  it('keeps a chapter that was already empty', () => {
    expect(cutTime([ch('a', 0, 0)], 100, 150)).toEqual([ch('a', 0, 0)]);
  });

  it('is the exact reverse of inserting', () => {
    const before = [ch('a', 0, 100), ch('b', 100, 150), ch('c', 150, 175)];
    expect(cutTime(insertTime(before, 100, 40), 100, 140)).toEqual(before);
  });
});
