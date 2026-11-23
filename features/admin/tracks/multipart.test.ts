import { describe, expect, it } from 'vitest';
import {
  MAX_PARTS,
  MIN_PART_BYTES,
  PART_SIZE_BYTES,
  SINGLE_PUT_MAX_BYTES,
  needsMultipart,
  overallFraction,
  partCount,
  splitIntoParts,
  validateCompletedParts,
} from './multipart';

const MB = 1024 * 1024;

describe('limits', () => {
  it('keeps the single request up to 100 MB and splits above it', () => {
    expect(SINGLE_PUT_MAX_BYTES).toBe(100 * MB);
    expect(needsMultipart(100 * MB)).toBe(false);
    expect(needsMultipart(100 * MB + 1)).toBe(true);
    expect(needsMultipart(500 * MB)).toBe(true);
  });

  it('uses a part size storage accepts (5 MiB or more) and that keeps 500 MB far below 10,000 parts', () => {
    expect(PART_SIZE_BYTES).toBeGreaterThanOrEqual(MIN_PART_BYTES);
    expect(partCount(500 * MB)).toBeLessThan(MAX_PARTS);
  });
});

describe('splitIntoParts', () => {
  it('cuts the file into equal parts with a shorter last one, numbered from 1 and without gaps', () => {
    const parts = splitIntoParts(40 * MB, 16 * MB);
    expect(parts).toEqual([
      { partNumber: 1, start: 0, end: 16 * MB, size: 16 * MB },
      { partNumber: 2, start: 16 * MB, end: 32 * MB, size: 16 * MB },
      { partNumber: 3, start: 32 * MB, end: 40 * MB, size: 8 * MB },
    ]);
  });

  it('makes one part for a file that fits in one, and no empty last part when the size divides evenly', () => {
    expect(splitIntoParts(6 * MB, 16 * MB)).toEqual([
      { partNumber: 1, start: 0, end: 6 * MB, size: 6 * MB },
    ]);
    expect(splitIntoParts(32 * MB, 16 * MB).map((p) => p.size)).toEqual([16 * MB, 16 * MB]);
  });

  it('covers every byte exactly once for sizes around the boundaries', () => {
    for (const size of [1, 5 * MB - 1, 16 * MB - 1, 16 * MB, 16 * MB + 1, 101 * MB + 7, 500 * MB]) {
      const parts = splitIntoParts(size);
      expect(parts[0]!.start).toBe(0);
      expect(parts.at(-1)!.end).toBe(size);
      for (let i = 1; i < parts.length; i++) expect(parts[i]!.start).toBe(parts[i - 1]!.end);
      expect(parts.reduce((sum, p) => sum + p.size, 0)).toBe(size);
      expect(parts.map((p) => p.partNumber)).toEqual(parts.map((_, i) => i + 1));
      expect(parts.length).toBe(partCount(size));
    }
  });

  it('never makes a part other than the last smaller than the minimum storage accepts', () => {
    const parts = splitIntoParts(101 * MB + 7);
    for (const part of parts.slice(0, -1)) expect(part.size).toBeGreaterThanOrEqual(MIN_PART_BYTES);
  });

  it('refuses an empty or invalid size, a part size below the minimum, and more than 10,000 parts', () => {
    expect(() => splitIntoParts(0)).toThrow();
    expect(() => splitIntoParts(-5)).toThrow();
    expect(() => splitIntoParts(Number.NaN)).toThrow();
    expect(() => splitIntoParts(50 * MB, MIN_PART_BYTES - 1)).toThrow();
    expect(() => splitIntoParts(MAX_PARTS * MIN_PART_BYTES + 1, MIN_PART_BYTES)).toThrow();
  });
});

describe('validateCompletedParts', () => {
  const ok = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ partNumber: i + 1, etag: `"e${i + 1}"` }));

  it('accepts exactly the expected parts and returns them in part order, whatever order they arrived in', () => {
    const shuffled = [ok(3)[2]!, ok(3)[0]!, ok(3)[1]!];
    expect(validateCompletedParts(shuffled, 3)).toEqual({ ok: true, parts: ok(3) });
  });

  it('refuses a missing part, an extra part, a duplicate and a part number out of range', () => {
    expect(validateCompletedParts(ok(2), 3)).toMatchObject({ ok: false });
    expect(validateCompletedParts(ok(4), 3)).toMatchObject({ ok: false });
    expect(
      validateCompletedParts(
        [
          { partNumber: 1, etag: 'a' },
          { partNumber: 1, etag: 'b' },
          { partNumber: 3, etag: 'c' },
        ],
        3,
      ),
    ).toMatchObject({ ok: false });
    expect(validateCompletedParts([{ partNumber: 0, etag: 'a' }], 1)).toMatchObject({ ok: false });
    expect(validateCompletedParts([{ partNumber: 2, etag: 'a' }], 1)).toMatchObject({ ok: false });
  });

  it('refuses a part with no usable ETag or a part number that is not a whole number', () => {
    expect(validateCompletedParts([{ partNumber: 1, etag: '' }], 1)).toMatchObject({ ok: false });
    expect(validateCompletedParts([{ partNumber: 1, etag: '   ' }], 1)).toMatchObject({
      ok: false,
    });
    expect(validateCompletedParts([{ partNumber: 1.5, etag: 'a' }], 1)).toMatchObject({
      ok: false,
    });
  });
});

describe('overallFraction', () => {
  it('weights each part by its size, so a short last part does not count as much as a long one', () => {
    expect(overallFraction([16 * MB, 16 * MB, 8 * MB], [16 * MB, 0, 0])).toBeCloseTo(0.4);
    expect(overallFraction([16 * MB, 16 * MB, 8 * MB], [16 * MB, 16 * MB, 8 * MB])).toBe(1);
    expect(overallFraction([10, 10], [0, 0])).toBe(0);
  });

  it('stays between 0 and 1 even when a part reports more than its size, and is 0 for nothing to send', () => {
    expect(overallFraction([10, 10], [15, 10])).toBe(1);
    expect(overallFraction([10], [-3])).toBe(0);
    expect(overallFraction([], [])).toBe(0);
  });
});
