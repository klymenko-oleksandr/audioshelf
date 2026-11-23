// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import { createLibraryStore } from './library-store';

function setup() {
  const db = new LocalDb(`test-${Math.random()}`);
  let time = 1_000;
  const store = createLibraryStore(db, { now: () => (time += 10) });
  return { db, store };
}

describe.each([['likes'], ['listenLater']] as const)('%s', (which) => {
  it('adds, lists newest first and reports membership', async () => {
    const { store } = setup();
    const flags = store[which];
    await flags.add('a');
    await flags.add('b');

    expect((await flags.list()).map((r) => r.bookId)).toEqual(['b', 'a']);
    expect(await flags.has('a')).toBe(true);
    expect(await flags.has('zzz')).toBe(false);
  });

  it('stamps rows with the device id and a time', async () => {
    const { db, store } = setup();
    const row = await store[which].add('a');
    expect(row.deviceId).toBe(await getDeviceId(db));
    expect(row.addedAt).toBe(row.updatedAt);
  });

  it('keeps a tombstone when a book is removed, and hides it from the list', async () => {
    const { db, store } = setup();
    const flags = store[which];
    await flags.add('a');
    expect(await flags.remove('a')).toBe(true);

    expect(await flags.has('a')).toBe(false);
    expect(await flags.list()).toEqual([]);
    const raw = await db[which].get('a');
    expect(raw?.deletedAt).toBeDefined();
    expect(await flags.everything()).toHaveLength(1);
  });

  it('removing something that is not there reports false and writes nothing', async () => {
    const { db, store } = setup();
    expect(await store[which].remove('nope')).toBe(false);
    expect(await db[which].count()).toBe(0);
  });

  it('re-adding after a removal revives the row with a new addedAt', async () => {
    const { db, store } = setup();
    const flags = store[which];
    const first = await flags.add('a');
    await flags.remove('a');
    const again = await flags.add('a');

    expect(again.addedAt).toBeGreaterThan(first.addedAt);
    expect(await flags.has('a')).toBe(true);
    expect((await db[which].get('a'))?.deletedAt).toBeUndefined();
  });

  it('restore() undoes a removal on the same row, keeping the original addedAt and place in the list', async () => {
    const { db, store } = setup();
    const flags = store[which];
    const first = await flags.add('a');
    await flags.add('b');
    await flags.remove('a');
    const rowCount = await db[which].count();

    const restored = await flags.restore(first);

    expect(restored.addedAt).toBe(first.addedAt);
    expect(restored.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(await db[which].count()).toBe(rowCount); // the same row, not a new one
    expect((await db[which].get('a'))?.deletedAt).toBeUndefined();
    expect((await flags.list()).map((r) => r.bookId)).toEqual(['b', 'a']);
  });

  it('restore() stamps this device and does nothing to a row that is already live', async () => {
    const { db, store } = setup();
    const flags = store[which];
    const first = await flags.add('a');
    const again = await flags.restore(first);
    expect(again).toEqual(first);
    await flags.remove('a');
    const back = await flags.restore(first);
    expect(back.deviceId).toBe(await getDeviceId(db));
  });

  it('adding twice keeps one row and does not move it', async () => {
    const { store } = setup();
    const flags = store[which];
    const first = await flags.add('a');
    const second = await flags.add('a');
    expect(second).toEqual(first);
    expect(await flags.list()).toHaveLength(1);
  });
});

describe('likes and listenLater are independent', () => {
  it('liking does not queue, and removing one leaves the other', async () => {
    const { store } = setup();
    await store.likes.add('a');
    expect(await store.listenLater.has('a')).toBe(false);

    await store.listenLater.add('a');
    await store.likes.remove('a');
    expect(await store.listenLater.has('a')).toBe(true);
  });
});

describe('history', () => {
  it('records a start, keeps startedAt on later plays, lists most recent first', async () => {
    const { store } = setup();
    const first = await store.history.start('a');
    await store.history.start('b');
    const again = await store.history.start('a');

    expect(again.startedAt).toBe(first.startedAt);
    expect(again.lastPlayedAt).toBeGreaterThan(first.lastPlayedAt);
    expect((await store.history.list()).map((r) => r.bookId)).toEqual(['a', 'b']);
  });

  it('marks a book finished once, and a restart clears it', async () => {
    const { store } = setup();
    await store.history.start('a');
    const done = await store.history.finish('a');
    expect(done?.finishedAt).toBeDefined();
    expect(await store.history.finish('a')).toEqual(done);

    const restarted = await store.history.start('a', { restarted: true });
    expect(restarted.finishedAt).toBeUndefined();
  });

  it('finishing a book that is not in history does nothing', async () => {
    const { store } = setup();
    expect(await store.history.finish('ghost')).toBeUndefined();
  });

  it('removes with a tombstone', async () => {
    const { db, store } = setup();
    await store.history.start('a');
    expect(await store.history.remove('a')).toBe(true);
    expect(await store.history.list()).toEqual([]);
    expect((await db.history.get('a'))?.deletedAt).toBeDefined();
    expect(await store.history.remove('a')).toBe(false);
  });
});
