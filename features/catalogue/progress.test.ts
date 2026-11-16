import { describe, expect, it } from 'vitest';
import { chapterIndexFor, chapterStates, percentListened, pickContinue } from './progress';

const record = (bookId: string, position: number, updatedAt: number, finished = false) => ({
  bookId,
  position,
  finished,
  updatedAt,
});

describe('pickContinue', () => {
  it('keeps started, unfinished books, most recent first', () => {
    const picked = pickContinue(
      [
        record('old', 10, 1),
        record('done', 500, 9, true),
        record('new', 20, 5),
        record('zero', 0, 8),
      ],
      6,
    );
    expect(picked.map((r) => r.bookId)).toEqual(['new', 'old']);
  });

  it('respects the limit and does not reorder the input', () => {
    const input = [record('a', 1, 1), record('b', 1, 3), record('c', 1, 2)];
    expect(pickContinue(input, 2).map((r) => r.bookId)).toEqual(['b', 'c']);
    expect(input.map((r) => r.bookId)).toEqual(['a', 'b', 'c']);
  });
});

describe('chapterIndexFor', () => {
  const starts = [0, 600, 1800];
  it('finds the chapter that contains the position', () => {
    expect(chapterIndexFor(starts, 0)).toBe(0);
    expect(chapterIndexFor(starts, 599.9)).toBe(0);
    expect(chapterIndexFor(starts, 600)).toBe(1);
    expect(chapterIndexFor(starts, 99999)).toBe(2);
  });
  it('is -1 without chapters and 0 before the first start', () => {
    expect(chapterIndexFor([], 10)).toBe(-1);
    expect(chapterIndexFor([5, 10], 1)).toBe(0);
  });
});

describe('chapterStates', () => {
  it('marks chapters before the current one as done', () => {
    expect(chapterStates(4, 2, false)).toEqual(['done', 'done', 'current', 'upcoming']);
  });
  it('is all upcoming for a book never started and all done for a finished one', () => {
    expect(chapterStates(2, -1, false)).toEqual(['upcoming', 'upcoming']);
    expect(chapterStates(2, 1, true)).toEqual(['done', 'done']);
  });
});

describe('percentListened', () => {
  it('rounds, but never shows 0% for a started book or 100% before the end', () => {
    expect(percentListened(460, 1000)).toBe(46);
    expect(percentListened(1, 100000)).toBe(1);
    expect(percentListened(999.9, 1000)).toBe(99);
    expect(percentListened(0, 1000)).toBe(0);
    expect(percentListened(5, 0)).toBe(0);
  });
});
