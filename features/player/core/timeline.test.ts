import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  chapterIndexAt,
  chaptersFromTracks,
  clampToBook,
  locate,
  toBookTime,
  validateBook,
} from './timeline';
import type { PlayerChapter, PlayerTrack } from './types';

const tracks: PlayerTrack[] = [
  { id: 't1', url: 'https://m.example/1.mp3', duration: 600 },
  { id: 't2', url: 'https://m.example/2.mp3', duration: 1200.5 },
  { id: 't3', url: 'https://m.example/3.mp3', duration: 300 },
];
const timeline = buildTimeline(tracks);

describe('buildTimeline', () => {
  it('accumulates track starts and the total', () => {
    expect(timeline.starts).toEqual([0, 600, 1800.5]);
    expect(timeline.duration).toBe(2100.5);
  });

  it('handles a book with no tracks', () => {
    expect(buildTimeline([])).toEqual({ starts: [], durations: [], duration: 0 });
  });
});

describe('locate', () => {
  it.each([
    [0, 0, 0],
    [599.9, 0, 599.9],
    [600, 1, 0], // a boundary belongs to the track that starts there
    [1000, 1, 400],
    [1800.5, 2, 0],
    [2100, 2, 299.5],
    [2100.5, 2, 300], // the very end is the end of the last track
  ])('book time %d → track %d at %d', (bookTime, trackIndex, offset) => {
    const result = locate(timeline, bookTime);
    expect(result.trackIndex).toBe(trackIndex);
    expect(result.offset).toBeCloseTo(offset, 6);
  });

  it('clamps times outside the book', () => {
    expect(locate(timeline, -5)).toEqual({ trackIndex: 0, offset: 0 });
    expect(locate(timeline, 99_999)).toEqual({ trackIndex: 2, offset: 300 });
    expect(locate(timeline, Number.NaN)).toEqual({ trackIndex: 0, offset: 0 });
  });

  it('does not throw on an empty book', () => {
    expect(locate(buildTimeline([]), 10)).toEqual({ trackIndex: 0, offset: 0 });
  });
});

describe('toBookTime', () => {
  it('is the inverse of locate', () => {
    for (const time of [0, 1, 599.9, 600, 1234.5, 1800.5, 2000, 2100.5]) {
      const { trackIndex, offset } = locate(timeline, time);
      expect(toBookTime(timeline, trackIndex, offset)).toBeCloseTo(time, 6);
    }
  });

  it('clamps the offset to the track and the index to the book', () => {
    expect(toBookTime(timeline, 0, 9999)).toBe(600);
    expect(toBookTime(timeline, 1, -3)).toBe(600);
    expect(toBookTime(timeline, 99, 10)).toBe(1810.5);
    expect(toBookTime(buildTimeline([]), 0, 10)).toBe(0);
  });

  it('keeps positions valid when a part is appended to an ongoing book', () => {
    const longer = buildTimeline([...tracks, { duration: 900 }]);
    expect(locate(longer, 1000)).toEqual(locate(timeline, 1000));
    expect(longer.duration).toBe(3000.5);
  });
});

describe('chapters', () => {
  const chapters = chaptersFromTracks(tracks, (i) => `Part ${i + 1}`);

  it('defaults to one chapter per track', () => {
    expect(chapters).toEqual([
      { id: 't1', title: 'Part 1', start: 0, end: 600 },
      { id: 't2', title: 'Part 2', start: 600, end: 1800.5 },
      { id: 't3', title: 'Part 3', start: 1800.5, end: 2100.5 },
    ]);
  });

  it('finds the chapter for a position', () => {
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 599.99)).toBe(0);
    expect(chapterIndexAt(chapters, 600)).toBe(1);
    expect(chapterIndexAt(chapters, 2100.5)).toBe(2);
    expect(chapterIndexAt(chapters, 5000)).toBe(2);
    expect(chapterIndexAt(chapters, -1)).toBe(0);
    expect(chapterIndexAt([], 10)).toBe(-1);
  });

  it('supports chapters that split or span tracks', () => {
    const custom: PlayerChapter[] = [
      { id: 'a', title: 'Prologue', start: 0, end: 120 },
      { id: 'b', title: 'One', start: 120, end: 1500 }, // spans tracks 1 and 2
      { id: 'c', title: 'Two', start: 1500, end: 2100.5 },
    ];
    expect(chapterIndexAt(custom, 119)).toBe(0);
    expect(chapterIndexAt(custom, 700)).toBe(1);
    expect(locate(timeline, custom[1]!.start)).toEqual({ trackIndex: 0, offset: 120 });
    expect(validateBook({ tracks, chapters: custom })).toEqual([]);
  });
});

describe('clampToBook', () => {
  it('keeps a time inside the book', () => {
    expect(clampToBook(timeline, -1)).toBe(0);
    expect(clampToBook(timeline, 50)).toBe(50);
    expect(clampToBook(timeline, 1e9)).toBe(2100.5);
    expect(clampToBook(timeline, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('validateBook', () => {
  const chapters = chaptersFromTracks(tracks, (i) => `Part ${i + 1}`);

  it('accepts a well-formed book', () => {
    expect(validateBook({ tracks, chapters })).toEqual([]);
  });

  it('reports missing tracks, durations and URLs', () => {
    expect(validateBook({ tracks: [], chapters: [] })).toContain('The book has no tracks.');
    const broken = [{ id: 'x', url: '', duration: 0 }];
    expect(validateBook({ tracks: broken, chapters })).toEqual(
      expect.arrayContaining(['Track 1 has no duration.', 'Track 1 has no URL.']),
    );
  });

  it('reports chapter gaps, overlaps and wrong ends', () => {
    const gap = [chapters[0]!, { ...chapters[1]!, start: 700 }, chapters[2]!];
    expect(validateBook({ tracks, chapters: gap })).toContain(
      'Chapters 1 and 2 overlap or leave a gap.',
    );
    const short = [chapters[0]!, chapters[1]!];
    expect(validateBook({ tracks, chapters: short })).toContain(
      'The last chapter must end where the audio ends.',
    );
    const late = chapters.map((c, i) => (i === 0 ? { ...c, start: 5 } : c));
    expect(validateBook({ tracks, chapters: late })).toContain(
      'The first chapter must start at 0.',
    );
    const reversed = [{ ...chapters[0]!, end: 0 }, chapters[1]!, chapters[2]!];
    expect(validateBook({ tracks, chapters: reversed })).toContain(
      'Chapter 1 is empty or reversed.',
    );
  });

  it('tolerates sub-second rounding between metadata and chapters', () => {
    const rounded = chapters.map((c) => ({
      ...c,
      start: Math.round(c.start),
      end: Math.round(c.end),
    }));
    expect(validateBook({ tracks, chapters: rounded })).toEqual([]);
  });
});
