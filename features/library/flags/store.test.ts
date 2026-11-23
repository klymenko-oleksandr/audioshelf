// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserChannel } from '@/features/settings/channel';
import { LocalDb } from '@/lib/local-db/db';
import { createDexieFlagsRepo, LibraryFlagsStore, type FlagsRepo } from './store';

const stores: LibraryFlagsStore[] = [];
const dbs: LocalDb[] = [];

let clock = 1_000;
const now = () => (clock += 10);

function open(name: string, options: { channel?: string; repo?: FlagsRepo } = {}) {
  const db = new LocalDb(name);
  dbs.push(db);
  const store = new LibraryFlagsStore({
    repo: options.repo ?? createDexieFlagsRepo(db, { now }),
    channel: options.channel ? createBrowserChannel(options.channel, 'unused') : undefined,
  });
  stores.push(store);
  return { db, store };
}

const freshName = () => `test-${Math.random()}`;

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  for (const db of dbs.splice(0)) db.close();
  vi.restoreAllMocks();
});

describe('LibraryFlagsStore: reading', () => {
  it('starts empty and not ready, before anything is read', () => {
    const { store } = open(freshName());
    const snapshot = store.getSnapshot();
    expect(snapshot.ready).toBe(false);
    expect(snapshot.liked.size).toBe(0);
    expect(snapshot.listenLater.size).toBe(0);
  });

  it('reads the live rows, ignores tombstones, and tells subscribers once', async () => {
    const name = freshName();
    const first = open(name);
    await first.store.toggle('like', 'a');
    await first.store.toggle('like', 'gone');
    await first.store.toggle('like', 'gone'); // removed again: a tombstone
    await first.store.toggle('listenLater', 'b');

    const { store } = open(name);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();

    expect(store.getSnapshot().ready).toBe(true);
    expect([...store.getSnapshot().liked]).toEqual(['a']);
    expect([...store.getSnapshot().listenLater]).toEqual(['b']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('counts as ready when storage fails, so the UI does not wait forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = open(freshName(), {
      repo: {
        load: () => Promise.reject(new Error('no IDB')),
        add: () => Promise.reject(new Error('no IDB')),
        remove: () => Promise.reject(new Error('no IDB')),
        restore: () => Promise.reject(new Error('no IDB')),
      },
    });
    await store.load();
    expect(store.getSnapshot().ready).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('keeps the same snapshot object until something actually changes', async () => {
    const { store } = open(freshName());
    await store.load();
    const before = store.getSnapshot();
    await store.load(); // nothing differs
    expect(store.getSnapshot()).toBe(before);
  });
});

describe('LibraryFlagsStore: toggling', () => {
  it('applies at once, before the write finishes, and notifies once', async () => {
    const { store } = open(freshName());
    await store.load();
    const listener = vi.fn();
    store.subscribe(listener);

    const pending = store.toggle('like', 'a');
    await Promise.resolve();
    expect(store.getSnapshot().liked.has('a')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const result = await pending;
    expect(result).toMatchObject({ kind: 'like', bookId: 'a', on: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('saves, so a fresh store (a reload) shows it', async () => {
    const name = freshName();
    const first = open(name);
    await first.store.toggle('listenLater', 'a');

    const reloaded = open(name);
    await reloaded.store.load();
    expect(reloaded.store.getSnapshot().listenLater.has('a')).toBe(true);
  });

  it('turns it off with a tombstone, not a delete', async () => {
    const { db, store } = open(freshName());
    await store.toggle('like', 'a');
    const result = await store.toggle('like', 'a');
    expect(result.on).toBe(false);
    expect(store.getSnapshot().liked.has('a')).toBe(false);
    expect((await db.likes.get('a'))?.deletedAt).toBeDefined();
    expect(await db.likes.count()).toBe(1);
  });

  it('likes and Listen later do not affect each other', async () => {
    const { store } = open(freshName());
    await store.toggle('like', 'a');
    expect(store.getSnapshot().listenLater.has('a')).toBe(false);
    await store.toggle('listenLater', 'a');
    await store.toggle('like', 'a');
    expect(store.getSnapshot().listenLater.has('a')).toBe(true);
    expect(store.getSnapshot().liked.has('a')).toBe(false);
  });

  it('reads storage first when toggled before the first load', async () => {
    const name = freshName();
    await open(name).store.toggle('like', 'a');

    const { store } = open(name);
    const result = await store.toggle('like', 'a'); // never loaded: must see it is already liked
    expect(result.on).toBe(false);
    expect(store.getSnapshot().liked.has('a')).toBe(false);
  });

  it('survives quick repeated taps: the last one wins, one row', async () => {
    const { db, store } = open(freshName());
    await store.load();
    void store.toggle('like', 'a');
    void store.toggle('like', 'a');
    const last = store.toggle('like', 'a');
    expect((await last).on).toBe(true);
    await vi.waitFor(async () => expect((await db.likes.get('a'))?.deletedAt).toBeUndefined());
    expect(store.getSnapshot().liked.has('a')).toBe(true);
    expect(await db.likes.count()).toBe(1);
  });

  it('keeps the value for the session when saving fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = open(freshName(), {
      repo: {
        load: () => Promise.resolve({ like: [], listenLater: [] }),
        add: () => Promise.reject(new Error('quota')),
        remove: () => Promise.reject(new Error('quota')),
        restore: () => Promise.reject(new Error('quota')),
      },
    });
    await store.toggle('like', 'a');
    expect(store.getSnapshot().liked.has('a')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('a stale read from another tab does not undo a change that is still being saved', async () => {
    const name = freshName();
    const db = new LocalDb(name);
    dbs.push(db);
    const real = createDexieFlagsRepo(db, { now });
    let releaseAdd!: () => void;
    const gate = new Promise<void>((resolve) => (releaseAdd = resolve));
    const store = new LibraryFlagsStore({
      repo: {
        ...real,
        add: async (kind, bookId) => {
          await gate;
          return real.add(kind, bookId);
        },
      },
    });
    stores.push(store);
    await store.load();

    const pending = store.toggle('like', 'a');
    await Promise.resolve();
    await store.load(); // storage still says "not liked"
    expect(store.getSnapshot().liked.has('a')).toBe(true);

    releaseAdd();
    await pending;
    expect(store.getSnapshot().liked.has('a')).toBe(true);
  });
});

describe('LibraryFlagsStore: Undo', () => {
  it('undo of an add is a tombstone on the same row', async () => {
    const { db, store } = open(freshName());
    const added = await store.toggle('listenLater', 'a');
    expect(await added.undo()).toBe(true);

    expect(store.getSnapshot().listenLater.has('a')).toBe(false);
    expect((await db.listenLater.get('a'))?.deletedAt).toBeDefined();
    expect(await db.listenLater.count()).toBe(1);
  });

  it('undo of a removal restores the same row with its original addedAt', async () => {
    const { db, store } = open(freshName());
    await store.toggle('like', 'a');
    await store.toggle('like', 'b');
    const originalA = await db.likes.get('a');

    const removed = await store.toggle('like', 'a');
    expect(removed.on).toBe(false);
    expect(await removed.undo()).toBe(true);

    const restoredA = await db.likes.get('a');
    expect(store.getSnapshot().liked.has('a')).toBe(true);
    expect(restoredA?.deletedAt).toBeUndefined();
    expect(restoredA?.addedAt).toBe(originalA?.addedAt);
    expect(restoredA!.updatedAt).toBeGreaterThan(originalA!.updatedAt);
    expect(await db.likes.count()).toBe(2); // no new row
  });

  it('undo of a removal also works for a row that was loaded from storage', async () => {
    const name = freshName();
    await open(name).store.toggle('like', 'a');

    const { db, store } = open(name);
    await store.load();
    const originalAddedAt = (await db.likes.get('a'))!.addedAt;
    const removed = await store.toggle('like', 'a');
    await removed.undo();

    expect((await db.likes.get('a'))?.addedAt).toBe(originalAddedAt);
    expect(store.getSnapshot().liked.has('a')).toBe(true);
  });

  it('undo does nothing when the book has changed since (another action, another tab)', async () => {
    const { store } = open(freshName());
    const first = await store.toggle('like', 'a'); // on
    await store.toggle('like', 'a'); // off again

    expect(await first.undo()).toBe(false); // the add it would undo is already gone
    expect(store.getSnapshot().liked.has('a')).toBe(false);
  });

  it('undo twice does nothing the second time', async () => {
    const { store } = open(freshName());
    const result = await store.toggle('like', 'a');
    expect(await result.undo()).toBe(true);
    expect(await result.undo()).toBe(false);
    expect(store.getSnapshot().liked.has('a')).toBe(false);
  });

  it('undo is visible at once', async () => {
    const { store } = open(freshName());
    const result = await store.toggle('like', 'a');
    const pending = result.undo();
    await Promise.resolve();
    expect(store.getSnapshot().liked.has('a')).toBe(false);
    await pending;
  });
});

describe('LibraryFlagsStore: two tabs', () => {
  it('a change in one tab shows up in the other without a reload', async () => {
    const name = freshName();
    const channel = `ch-${Math.random()}`;
    const first = open(name, { channel });
    const second = open(name, { channel });
    await first.store.load();
    await second.store.load();

    await first.store.toggle('like', 'a');
    await vi.waitFor(() => expect(second.store.getSnapshot().liked.has('a')).toBe(true));

    await first.store.toggle('like', 'a');
    await vi.waitFor(() => expect(second.store.getSnapshot().liked.has('a')).toBe(false));
  });

  it('an Undo in one tab shows up in the other too', async () => {
    const name = freshName();
    const channel = `ch-${Math.random()}`;
    const first = open(name, { channel });
    const second = open(name, { channel });
    await first.store.load();
    await second.store.load();

    const result = await first.store.toggle('listenLater', 'a');
    await vi.waitFor(() => expect(second.store.getSnapshot().listenLater.has('a')).toBe(true));
    await result.undo();
    await vi.waitFor(() => expect(second.store.getSnapshot().listenLater.has('a')).toBe(false));
  });
});

describe('LibraryFlagsStore: when each book was added (Library sorts by it)', () => {
  it('knows when a stored book was added and shows a new add at once', async () => {
    const name = freshName();
    const { store } = open(name);
    await store.toggle('like', 'a');
    const stored = store.getSnapshot().likedAt.get('a');
    expect(typeof stored).toBe('number');

    const reopened = open(name);
    await reopened.store.load();
    expect(reopened.store.getSnapshot().likedAt.get('a')).toBe(stored);
    expect([...reopened.store.getSnapshot().listenLaterAt.keys()]).toEqual([]);
  });

  it('an Undo of a removal keeps the original time, even before it is saved', async () => {
    const { store } = open(freshName());
    await store.toggle('listenLater', 'a');
    const original = store.getSnapshot().listenLaterAt.get('a')!;
    const removed = await store.toggle('listenLater', 'a');
    expect(store.getSnapshot().listenLaterAt.has('a')).toBe(false);

    const undoing = removed.undo();
    expect(store.getSnapshot().listenLaterAt.get('a')).toBe(original);
    await undoing;
    expect(store.getSnapshot().listenLaterAt.get('a')).toBe(original);
  });
});

describe('LibraryFlagsStore.remove (a finished book leaves Listen later)', () => {
  it('removes a book that is in, at once, and saves it', async () => {
    const name = freshName();
    const { store } = open(name);
    await store.toggle('listenLater', 'a');
    await store.toggle('like', 'a');

    const removing = store.remove('listenLater', 'a');
    expect(store.getSnapshot().listenLater.has('a')).toBe(false);
    expect(await removing).toBe(true);

    const reopened = open(name);
    await reopened.store.load();
    expect(reopened.store.getSnapshot().listenLater.has('a')).toBe(false);
    // Liking is independent of Listen later (PRD).
    expect(reopened.store.getSnapshot().liked.has('a')).toBe(true);
  });

  it('does nothing and says so when the book was not in', async () => {
    const { store } = open(freshName());
    expect(await store.remove('listenLater', 'zzz')).toBe(false);
  });

  it('reaches the other tab', async () => {
    const name = freshName();
    const channel = `ch-${Math.random()}`;
    const first = open(name, { channel });
    const second = open(name, { channel });
    await first.store.toggle('listenLater', 'a');
    await second.store.load();
    expect(second.store.getSnapshot().listenLater.has('a')).toBe(true);

    await first.store.remove('listenLater', 'a');
    await vi.waitFor(() => expect(second.store.getSnapshot().listenLater.has('a')).toBe(false));
  });
});
