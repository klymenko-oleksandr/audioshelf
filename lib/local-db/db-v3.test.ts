// @vitest-environment node
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { LocalDb } from './db';

/** The database exactly as Phase 5a shipped it (version 2). */
function openV2(name: string) {
  const db = new Dexie(name);
  db.version(1).stores({ progress: 'bookId, updatedAt' });
  db.version(2).stores({
    likes: 'bookId, addedAt, updatedAt',
    listenLater: 'bookId, addedAt, updatedAt',
    history: 'bookId, lastPlayedAt, updatedAt',
    settings: 'key, updatedAt',
    meta: 'key',
  });
  return db;
}

const base = { deviceId: 'd1' };
const SEED: Record<string, object[]> = {
  progress: [
    {
      bookId: 'a',
      position: 1234.5,
      duration: 36_000,
      speed: 1.25,
      finished: false,
      updatedAt: 3,
      pausedAt: 2,
    },
    {
      bookId: 'b',
      position: 99,
      duration: 100,
      speed: 1,
      finished: true,
      updatedAt: 4,
      dismissedAt: 4,
    },
  ],
  likes: [
    { ...base, bookId: 'a', addedAt: 1, updatedAt: 1 },
    { ...base, bookId: 'b', addedAt: 1, updatedAt: 5, deletedAt: 5 },
  ],
  listenLater: [{ ...base, bookId: 'c', addedAt: 2, updatedAt: 2 }],
  history: [
    { ...base, bookId: 'a', startedAt: 1, lastPlayedAt: 3, updatedAt: 3 },
    {
      ...base,
      bookId: 'b',
      startedAt: 1,
      lastPlayedAt: 4,
      finishedAt: 4,
      updatedAt: 6,
      deletedAt: 6,
    },
  ],
  settings: [{ ...base, key: 'theme', value: 'dark', updatedAt: 9 }],
  meta: [
    { key: 'deviceId', value: 'd1' },
    { key: 'guestNudge', value: { actions: 4, dismissedAt: 8, actionsAtDismiss: 4 } },
    { key: 'historyBackfilledAt', value: 7 },
    { key: 'welcomeSeenAt', value: 6 },
  ],
};

async function seeded() {
  const name = `test-${Math.random()}`;
  const old = openV2(name);
  for (const [table, rows] of Object.entries(SEED)) await old.table(table).bulkPut(rows);
  old.close();
  return name;
}

async function expectSeed(db: LocalDb) {
  for (const [table, rows] of Object.entries(SEED)) {
    expect(await db.table(table).toArray(), table).toEqual(rows);
  }
}

describe('LocalDb upgrade from version 2 to 3', () => {
  it('keeps positions, likes, Listen later, history, settings and meta exactly', async () => {
    const db = new LocalDb(await seeded());
    await expectSeed(db);
    expect(db.verno).toBe(3);
    db.close();
  });

  it('keeps the old indexes working', async () => {
    const db = new LocalDb(await seeded());
    expect((await db.progress.orderBy('updatedAt').toArray()).map((r) => r.bookId)).toEqual([
      'a',
      'b',
    ]);
    expect((await db.likes.orderBy('addedAt').toArray()).length).toBe(2);
    expect((await db.history.orderBy('lastPlayedAt').last())?.bookId).toBe('b');
    expect((await db.settings.orderBy('updatedAt').first())?.key).toBe('theme');
    db.close();
  });

  it('adds an empty outbox, indexed by owner', async () => {
    const db = new LocalDb(await seeded());
    expect(await db.outbox.count()).toBe(0);
    expect(await db.outbox.where('owner').equals('x').count()).toBe(0);
    db.close();
  });

  it('upgrades only once: reopening changes nothing', async () => {
    const name = await seeded();
    const first = new LocalDb(name);
    await first.open();
    first.close();
    const second = new LocalDb(name);
    await expectSeed(second);
    second.close();
  });
});
