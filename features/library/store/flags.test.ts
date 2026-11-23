import { describe, expect, it } from 'vitest';
import type { FlagRecord } from '@/lib/local-db/types';
import { addFlag, isLive, liveFlags, removeFlag } from './flags';

const live = (bookId: string, addedAt: number): FlagRecord => ({
  bookId,
  addedAt,
  updatedAt: addedAt,
  deviceId: 'd1',
});

describe('addFlag', () => {
  it('creates a live record stamped with the time and device', () => {
    expect(addFlag(undefined, 'b1', 100, 'd1')).toEqual({
      bookId: 'b1',
      addedAt: 100,
      updatedAt: 100,
      deviceId: 'd1',
    });
  });

  it('leaves an already-live record exactly as it is (adding twice is a no-op)', () => {
    const existing = live('b1', 100);
    expect(addFlag(existing, 'b1', 500, 'd2')).toBe(existing);
  });

  it('brings a removed one back: tombstone cleared, addedAt and updatedAt are new', () => {
    const removed: FlagRecord = { ...live('b1', 100), updatedAt: 200, deletedAt: 200 };
    const again = addFlag(removed, 'b1', 900, 'd2');
    expect(again).toEqual({ bookId: 'b1', addedAt: 900, updatedAt: 900, deviceId: 'd2' });
    expect('deletedAt' in again).toBe(false);
  });
});

describe('removeFlag', () => {
  it('turns a live record into a tombstone and keeps addedAt', () => {
    expect(removeFlag(live('b1', 100), 300, 'd2')).toEqual({
      bookId: 'b1',
      addedAt: 100,
      updatedAt: 300,
      deviceId: 'd2',
      deletedAt: 300,
    });
  });

  it('does nothing when there is no record or it is already removed', () => {
    expect(removeFlag(undefined, 300, 'd1')).toBeUndefined();
    expect(removeFlag({ ...live('b1', 1), deletedAt: 2 }, 300, 'd1')).toBeUndefined();
  });
});

describe('isLive / liveFlags', () => {
  it('treats a missing or removed record as not live', () => {
    expect(isLive(undefined)).toBe(false);
    expect(isLive({ ...live('b1', 1), deletedAt: 2 })).toBe(false);
    expect(isLive(live('b1', 1))).toBe(true);
  });

  it('lists live records newest first and drops tombstones', () => {
    const records = [
      live('old', 100),
      { ...live('gone', 300), deletedAt: 400 },
      live('new', 500),
      live('mid', 300),
    ];
    expect(liveFlags(records).map((r) => r.bookId)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks ties by book id so the order is stable', () => {
    expect(liveFlags([live('b', 1), live('a', 1)]).map((r) => r.bookId)).toEqual(['a', 'b']);
  });
});
