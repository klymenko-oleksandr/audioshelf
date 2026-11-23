// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import { DEFAULT_SETTINGS } from './definitions';
import { createBrowserChannel } from './channel';
import { createDexieSettingsRepo, SettingsStore, type SettingsRepo } from './store';

const stores: SettingsStore[] = [];
const dbs: LocalDb[] = [];

function open(name: string, options: { channel?: string; repo?: SettingsRepo } = {}) {
  const db = new LocalDb(name);
  dbs.push(db);
  const store = new SettingsStore({
    repo: options.repo ?? createDexieSettingsRepo(db),
    deviceId: () => getDeviceId(db),
    channel: options.channel ? createBrowserChannel(options.channel) : undefined,
    now: () => 5_000,
  });
  stores.push(store);
  return { db, store };
}

const freshName = () => `test-${Math.random()}`;

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  for (const db of dbs.splice(0)) db.close();
});

describe('SettingsStore', () => {
  it('starts on the defaults, before anything is read', () => {
    const { store } = open(freshName());
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
  });

  it('says when storage has been read, and tells subscribers', async () => {
    const { store } = open(freshName());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.isLoaded()).toBe(false);

    await store.load();
    expect(store.isLoaded()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1); // even though nothing differed from the defaults
  });

  it('counts as loaded when storage fails, so the page does not wait forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = open(freshName(), {
      repo: { load: () => Promise.reject(new Error('no IDB')), put: () => Promise.resolve() },
    });
    await store.load();
    expect(store.isLoaded()).toBe(true);
    warn.mockRestore();
  });

  it('applies a change immediately, notifying once', async () => {
    const { store } = open(freshName());
    const listener = vi.fn();
    store.subscribe(listener);

    const pending = store.set('skipBackSeconds', 30);
    expect(store.getSnapshot().skipBackSeconds).toBe(30); // before the write finishes
    expect(listener).toHaveBeenCalledTimes(1);
    await pending;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps a change across a reload (a new store on the same database)', async () => {
    const name = freshName();
    const first = open(name);
    await first.store.set('theme', 'dark');
    await first.store.set('autoRewind', false);
    first.store.dispose();
    first.db.close();

    const second = open(name);
    expect(second.store.getSnapshot().theme).toBe('system'); // not read yet
    await second.store.load();
    expect(second.store.getSnapshot()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      autoRewind: false,
    });
  });

  it('writes one row per setting with the time and the device id', async () => {
    const { db, store } = open(freshName());
    await store.set('defaultSpeed', 1.5);
    expect(await db.settings.toArray()).toEqual([
      {
        key: 'defaultSpeed',
        value: 1.5,
        updatedAt: 5_000,
        deviceId: await getDeviceId(db),
      },
    ]);
  });

  it('rejects an invalid value: nothing changes, nothing is written', async () => {
    const { db, store } = open(freshName());
    const listener = vi.fn();
    store.subscribe(listener);

    expect(await store.set('skipBackSeconds', 20 as never)).toBe(false);
    expect(await store.set('theme', 'sepia' as never)).toBe(false);
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS);
    expect(listener).not.toHaveBeenCalled();
    expect(await db.settings.count()).toBe(0);
  });

  it('keeps the snapshot object when setting the value it already has', async () => {
    const { store } = open(freshName());
    const before = store.getSnapshot();
    await store.set('theme', 'system');
    expect(store.getSnapshot()).toBe(before);
  });

  it('ignores rows with bad or unknown values when loading', async () => {
    const { db, store } = open(freshName());
    await db.settings.bulkPut([
      { key: 'theme', value: 'sepia', updatedAt: 1, deviceId: 'x' },
      { key: 'futureThing', value: 1, updatedAt: 1, deviceId: 'x' },
      { key: 'skipForwardSeconds', value: 60, updatedAt: 1, deviceId: 'x' },
    ]);
    await store.load();
    expect(store.getSnapshot()).toEqual({ ...DEFAULT_SETTINGS, skipForwardSeconds: 60 });
  });

  it('still works for the session when storage fails', async () => {
    const broken: SettingsRepo = {
      load: () => Promise.reject(new Error('IndexedDB unavailable')),
      put: () => Promise.reject(new Error('IndexedDB unavailable')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = open(freshName(), { repo: broken });

    await store.load();
    await expect(store.set('theme', 'dark')).resolves.toBe(true);
    expect(store.getSnapshot().theme).toBe('dark');
    warn.mockRestore();
  });

  it('does not let a read that started earlier undo a change made meanwhile', async () => {
    const name = freshName();
    const { db, store } = open(name);
    await db.settings.put({ key: 'theme', value: 'light', updatedAt: 1, deviceId: 'x' });

    const reading = store.load(); // will see the old row
    const writing = store.set('theme', 'dark');
    await Promise.all([reading, writing]);
    expect(store.getSnapshot().theme).toBe('dark');
  });
});

describe('two tabs', () => {
  it('a change in one shows up in the other, without a reload', async () => {
    const name = freshName();
    const channel = `settings-${Math.random()}`;
    const tabA = open(name, { channel });
    const tabB = open(name, { channel });
    await tabA.store.load();
    await tabB.store.load();

    const seen = vi.fn();
    tabB.store.subscribe(seen);

    await tabA.store.set('skipForwardSeconds', 60);
    await vi.waitFor(() => expect(tabB.store.getSnapshot().skipForwardSeconds).toBe(60));
    expect(seen).toHaveBeenCalled();
  });

  it('works both ways and for several settings', async () => {
    const name = freshName();
    const channel = `settings-${Math.random()}`;
    const tabA = open(name, { channel });
    const tabB = open(name, { channel });
    await tabA.store.load();
    await tabB.store.load();

    await tabB.store.set('theme', 'dark');
    await vi.waitFor(() => expect(tabA.store.getSnapshot().theme).toBe('dark'));
    await tabA.store.set('continueToNextChapter', false);
    await vi.waitFor(() => expect(tabB.store.getSnapshot().continueToNextChapter).toBe(false));
  });

  it("does not echo a tab's own change back to it as a second update", async () => {
    const name = freshName();
    const channel = `settings-${Math.random()}`;
    const tabA = open(name, { channel });
    open(name, { channel });
    const listener = vi.fn();
    tabA.store.subscribe(listener);

    await tabA.store.set('autoRewind', false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
