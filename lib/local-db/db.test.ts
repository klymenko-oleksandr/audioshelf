// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie, { type EntityTable } from 'dexie';
import { describe, expect, it } from 'vitest';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import { LocalDb } from './db';

/** The database exactly as Phase 2 shipped it: version 1, progress only. */
class LocalDbV1 extends Dexie {
  progress!: EntityTable<ProgressRecord, 'bookId'>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ progress: 'bookId, updatedAt' });
  }
}

const progress = (bookId: string, position: number, updatedAt: number): ProgressRecord => ({
  bookId,
  position,
  duration: 36_000,
  speed: 1.25,
  finished: false,
  updatedAt,
});

const freshName = () => `test-${Math.random()}`;

describe('LocalDb upgrade from version 1', () => {
  it('keeps every saved position, untouched', async () => {
    const name = freshName();
    const old = new LocalDbV1(name);
    await old.progress.bulkPut([
      progress('book-a', 1234.5, 1_000),
      progress('book-b', 99, 2_000),
      { ...progress('book-c', 36_000, 3_000), finished: true },
    ]);
    old.close();

    const db = new LocalDb(name);
    const all = await db.progress.orderBy('bookId').toArray();
    expect(all).toEqual([
      progress('book-a', 1234.5, 1_000),
      progress('book-b', 99, 2_000),
      { ...progress('book-c', 36_000, 3_000), finished: true },
    ]);
    db.close();
  });

  it('keeps the updatedAt index working on the old rows', async () => {
    const name = freshName();
    const old = new LocalDbV1(name);
    await old.progress.bulkPut([progress('late', 1, 5_000), progress('early', 1, 1_000)]);
    old.close();

    const db = new LocalDb(name);
    const byTime = await db.progress.orderBy('updatedAt').toArray();
    expect(byTime.map((r) => r.bookId)).toEqual(['early', 'late']);
    db.close();
  });

  it('adds the new tables, empty', async () => {
    const name = freshName();
    const old = new LocalDbV1(name);
    await old.progress.put(progress('book-a', 1, 1));
    old.close();

    const db = new LocalDb(name);
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'history',
      'likes',
      'listenLater',
      'meta',
      'progress',
      'settings',
    ]);
    for (const table of [db.likes, db.listenLater, db.history, db.settings, db.meta]) {
      expect(await table.count()).toBe(0);
    }
    db.close();
  });

  it('upgrades only once: reopening changes nothing', async () => {
    const name = freshName();
    const old = new LocalDbV1(name);
    await old.progress.put(progress('book-a', 42, 7));
    old.close();

    const first = new LocalDb(name);
    await first.settings.put({ key: 'theme', value: 'dark', updatedAt: 9, deviceId: 'd1' });
    first.close();

    const second = new LocalDb(name);
    expect(await second.progress.toArray()).toEqual([progress('book-a', 42, 7)]);
    expect(await second.settings.toArray()).toEqual([
      { key: 'theme', value: 'dark', updatedAt: 9, deviceId: 'd1' },
    ]);
    second.close();
  });

  it('also works for a brand-new device', async () => {
    const db = new LocalDb(freshName());
    await db.progress.put(progress('book-a', 5, 1));
    expect(await db.progress.count()).toBe(1);
    db.close();
  });
});
