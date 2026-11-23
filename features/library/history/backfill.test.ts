import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '@/lib/local-db/types';
import { planBackfill } from './backfill';

const progress = (bookId: string, position: number, updatedAt: number, finished = false) => ({
  bookId,
  position,
  finished,
  updatedAt,
});

const entry = (bookId: string, extra: Partial<HistoryRecord> = {}): HistoryRecord => ({
  bookId,
  startedAt: 1,
  lastPlayedAt: 1,
  updatedAt: 1,
  deviceId: 'd',
  ...extra,
});

describe('planBackfill — History for books played before History existed', () => {
  it('makes an entry for every saved place, dated by its last save', () => {
    const rows = planBackfill([progress('a', 120, 5000), progress('b', 30, 9000)], [], 'dev');
    expect(rows).toEqual([
      { bookId: 'a', startedAt: 5000, lastPlayedAt: 5000, updatedAt: 5000, deviceId: 'dev' },
      { bookId: 'b', startedAt: 9000, lastPlayedAt: 9000, updatedAt: 9000, deviceId: 'dev' },
    ]);
  });

  it('carries the finished state over', () => {
    const [row] = planBackfill([progress('a', 2090, 5000, true)], [], 'dev');
    expect(row).toMatchObject({ bookId: 'a', finishedAt: 5000 });
  });

  it('does not touch a book that already has an entry, even a removed one', () => {
    const rows = planBackfill(
      [progress('a', 10, 100), progress('b', 10, 100), progress('c', 10, 100)],
      [entry('a'), entry('b', { deletedAt: 50 })],
      'dev',
    );
    expect(rows.map((row) => row.bookId)).toEqual(['c']);
  });

  it('skips a place that was never really started', () => {
    expect(planBackfill([progress('a', 0, 100)], [], 'dev')).toEqual([]);
  });

  it('is empty when there is nothing saved', () => {
    expect(planBackfill([], [], 'dev')).toEqual([]);
  });
});
