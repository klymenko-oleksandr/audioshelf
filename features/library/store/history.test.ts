import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '@/lib/local-db/types';
import { liveHistory, recordFinish, recordStart, removeHistory } from './history';

const entry = (bookId: string, lastPlayedAt: number, more: Partial<HistoryRecord> = {}) => ({
  bookId,
  startedAt: 10,
  lastPlayedAt,
  updatedAt: lastPlayedAt,
  deviceId: 'd1',
  ...more,
});

describe('recordStart', () => {
  it('creates an entry the first time a book is started', () => {
    expect(recordStart(undefined, 'b1', 100, 'd1')).toEqual({
      bookId: 'b1',
      startedAt: 100,
      lastPlayedAt: 100,
      updatedAt: 100,
      deviceId: 'd1',
    });
  });

  it('keeps startedAt and finishedAt when the book is played again', () => {
    const before = entry('b1', 50, { finishedAt: 60 });
    expect(recordStart(before, 'b1', 200, 'd2')).toEqual({
      ...before,
      lastPlayedAt: 200,
      updatedAt: 200,
      deviceId: 'd2',
    });
  });

  it('clears finishedAt when the listener restarts a finished book', () => {
    const before = entry('b1', 50, { finishedAt: 60 });
    const restarted = recordStart(before, 'b1', 200, 'd1', { restarted: true });
    expect('finishedAt' in restarted).toBe(false);
    expect(restarted.startedAt).toBe(200);
  });

  it('starts a fresh entry over a removed one', () => {
    const removed = entry('b1', 50, { deletedAt: 70, finishedAt: 60 });
    const fresh = recordStart(removed, 'b1', 300, 'd1');
    expect(fresh).toEqual({
      bookId: 'b1',
      startedAt: 300,
      lastPlayedAt: 300,
      updatedAt: 300,
      deviceId: 'd1',
    });
  });
});

describe('recordFinish', () => {
  it('stamps finishedAt once and keeps the first time', () => {
    const first = recordFinish(entry('b1', 50), 400, 'd1')!;
    expect(first.finishedAt).toBe(400);
    expect(recordFinish(first, 900, 'd1')).toBe(first);
  });

  it('needs a live entry', () => {
    expect(recordFinish(undefined, 1, 'd1')).toBeUndefined();
    expect(recordFinish(entry('b1', 1, { deletedAt: 2 }), 3, 'd1')).toBeUndefined();
  });
});

describe('removeHistory', () => {
  it('writes a tombstone and keeps the rest', () => {
    expect(removeHistory(entry('b1', 50), 80, 'd2')).toEqual({
      ...entry('b1', 50),
      updatedAt: 80,
      deviceId: 'd2',
      deletedAt: 80,
    });
  });

  it('does nothing for a missing or already removed entry', () => {
    expect(removeHistory(undefined, 1, 'd1')).toBeUndefined();
    expect(removeHistory(entry('b1', 1, { deletedAt: 2 }), 3, 'd1')).toBeUndefined();
  });
});

describe('liveHistory', () => {
  it('lists most recently played first without tombstones', () => {
    const list = liveHistory([
      entry('a', 100),
      entry('b', 300),
      entry('c', 200, { deletedAt: 250 }),
      entry('d', 200),
    ]);
    expect(list.map((r) => r.bookId)).toEqual(['b', 'd', 'a']);
  });
});
