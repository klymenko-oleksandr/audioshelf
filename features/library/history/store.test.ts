// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserChannel } from '@/features/settings/channel';
import { LocalDb } from '@/lib/local-db/db';
import { createDexieHistoryRepo, LibraryHistoryStore, type HistoryRepo } from './store';

const stores: LibraryHistoryStore[] = [];
const dbs: LocalDb[] = [];

let clock = 1_000;
const now = () => (clock += 10);

function open(name: string, options: { channel?: string; repo?: HistoryRepo } = {}) {
  const db = new LocalDb(name);
  dbs.push(db);
  const store = new LibraryHistoryStore({
    repo: options.repo ?? createDexieHistoryRepo(db, { now }),
    channel: options.channel ? createBrowserChannel(options.channel, 'unused') : undefined,
  });
  stores.push(store);
  return { db, store };
}

const freshName = () => `history-${Math.random()}`;
const ids = (store: LibraryHistoryStore) => store.getSnapshot().entries.map((e) => e.bookId);

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  for (const db of dbs.splice(0)) db.close();
  vi.restoreAllMocks();
});

describe('LibraryHistoryStore: recording', () => {
  it('starts empty and not ready', () => {
    const { store } = open(freshName());
    expect(store.getSnapshot()).toMatchObject({ ready: false, entries: [] });
  });

  it('writes an entry on the first play and keeps startedAt on later plays', async () => {
    const { store, db } = open(freshName());
    await store.recordPlay('a', false);
    const first = await db.history.get('a');
    await store.recordPlay('a', false);
    const second = await db.history.get('a');

    expect(second?.startedAt).toBe(first?.startedAt);
    expect(second!.lastPlayedAt).toBeGreaterThan(first!.lastPlayedAt);
    expect(ids(store)).toEqual(['a']);
  });

  it('shows the entry at once, before it is saved', async () => {
    const { store } = open(freshName());
    await store.load();
    const writing = store.recordPlay('a', false);
    expect(ids(store)).toEqual(['a']);
    await writing;
  });

  it('puts the most recently played book first', async () => {
    const { store } = open(freshName());
    await store.recordPlay('a', false);
    await store.recordPlay('b', false);
    await store.recordPlay('a', false);
    expect(ids(store)).toEqual(['a', 'b']);
  });

  it('marks finished, once; a restart clears it', async () => {
    const { store, db } = open(freshName());
    await store.recordPlay('a', false);
    await store.recordFinish('a');
    const finishedAt = (await db.history.get('a'))?.finishedAt;
    expect(finishedAt).toBeDefined();
    expect(store.getSnapshot().entries[0]?.finishedAt).toBe(finishedAt);

    await store.recordFinish('a');
    expect((await db.history.get('a'))?.finishedAt).toBe(finishedAt);

    await store.recordPlay('a', true);
    expect((await db.history.get('a'))?.finishedAt).toBeUndefined();
    expect(store.getSnapshot().entries[0]?.finishedAt).toBeUndefined();
  });

  it('finish for a book with no entry changes nothing', async () => {
    const { store, db } = open(freshName());
    await store.recordFinish('ghost');
    expect(await db.history.count()).toBe(0);
    expect(ids(store)).toEqual([]);
  });

  it('removing hides the entry at once and leaves a tombstone', async () => {
    const { store, db } = open(freshName());
    await store.recordPlay('a', false);
    await store.recordPlay('b', false);
    const removing = store.remove('a');
    expect(ids(store)).toEqual(['b']);
    expect(await removing).toBe(true);
    expect((await db.history.get('a'))?.deletedAt).toBeDefined();
    expect(await db.history.count()).toBe(2);
  });

  it('playing a removed book starts a fresh entry', async () => {
    const { store, db } = open(freshName());
    await store.recordPlay('a', false);
    await store.remove('a');
    await store.recordPlay('a', false);
    expect(ids(store)).toEqual(['a']);
    expect((await db.history.get('a'))?.deletedAt).toBeUndefined();
  });

  it('quick writes keep their order', async () => {
    const { store } = open(freshName());
    await Promise.all([
      store.recordPlay('a', false),
      store.recordFinish('a'),
      store.recordPlay('a', true),
    ]);
    expect(store.getSnapshot().entries[0]?.finishedAt).toBeUndefined();
  });

  it('a failed save keeps the entry for the session and does not throw', async () => {
    const repo: HistoryRepo = {
      load: async () => [],
      start: async () => {
        throw new Error('quota');
      },
      finish: async () => undefined,
      remove: async () => false,
      backfill: async () => 0,
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = open(freshName(), { repo });
    await expect(store.recordPlay('a', false)).resolves.toBeUndefined();
    expect(ids(store)).toEqual(['a']);
  });
});

describe('LibraryHistoryStore: reading', () => {
  it('reads what was saved, most recent first, without removed entries', async () => {
    const name = freshName();
    const first = open(name);
    await first.store.recordPlay('a', false);
    await first.store.recordPlay('b', false);
    await first.store.recordPlay('c', false);
    await first.store.remove('b');

    const second = open(name);
    await second.store.load();
    expect(second.store.getSnapshot().ready).toBe(true);
    expect(ids(second.store)).toEqual(['c', 'a']);
  });

  it('keeps the same snapshot object when a read finds nothing new', async () => {
    const { store } = open(freshName());
    await store.recordPlay('a', false);
    const before = store.getSnapshot();
    await store.load();
    expect(store.getSnapshot()).toBe(before);
  });

  it('a stale read cannot undo a change that is still being saved', async () => {
    const name = freshName();
    const { store } = open(name);
    await store.load();
    const writing = store.recordPlay('a', false);
    const reading = store.load();
    await Promise.all([writing, reading]);
    expect(ids(store)).toEqual(['a']);
  });
});

describe('LibraryHistoryStore: backfill from saved places', () => {
  const place = (bookId: string, position: number, updatedAt: number, finished = false) => ({
    bookId,
    position,
    duration: 1000,
    speed: 1,
    finished,
    updatedAt,
  });

  it('adds entries for books played before History existed, once', async () => {
    const name = freshName();
    const { store, db } = open(name);
    await store.backfill([place('a', 100, 5000), place('b', 950, 7000, true)]);
    expect(ids(store)).toEqual(['b', 'a']);
    expect((await db.history.get('b'))?.finishedAt).toBe(7000);

    // A second run, even with new saved places, does nothing: it is a one-time migration.
    await store.backfill([place('c', 10, 9000)]);
    expect(ids(store)).toEqual(['b', 'a']);
  });

  it('does not overwrite an entry made by a play that came first', async () => {
    const { store, db } = open(freshName());
    await store.recordPlay('a', false);
    const mine = await db.history.get('a');
    await store.backfill([place('a', 100, 5000)]);
    expect(await db.history.get('a')).toEqual(mine);
  });

  it('does not bring back a book the listener removed', async () => {
    const { store } = open(freshName());
    await store.recordPlay('a', false);
    await store.remove('a');
    await store.backfill([place('a', 100, 5000)]);
    expect(ids(store)).toEqual([]);
  });
});

describe('LibraryHistoryStore: two tabs', () => {
  it('a play in one tab shows up in the other without a reload', async () => {
    const name = freshName();
    const channel = `ch-${Math.random()}`;
    const first = open(name, { channel });
    const second = open(name, { channel });
    await second.store.load();

    await first.store.recordPlay('a', false);
    await vi.waitFor(() => expect(ids(second.store)).toEqual(['a']));

    await first.store.remove('a');
    await vi.waitFor(() => expect(ids(second.store)).toEqual([]));
  });
});
