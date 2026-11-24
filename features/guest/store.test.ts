// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserChannel } from '@/features/settings/channel';
import { LocalDb } from '@/lib/local-db/db';
import { NUDGE_SNOOZE_ACTIONS, nudgeDue } from './nudge';
import { GuestStore, createDexieGuestRepo, type GuestRepo } from './store';

const stores: GuestStore[] = [];
const dbs: LocalDb[] = [];
const freshName = () => `guest-test-${Math.random()}`;

let clock = 1_000_000;
const now = () => clock;

function open(name: string, options: { channel?: string; repo?: GuestRepo } = {}) {
  const db = new LocalDb(name);
  dbs.push(db);
  const store = new GuestStore({
    repo: options.repo ?? createDexieGuestRepo(db),
    channel: options.channel ? createBrowserChannel(options.channel, 'unused') : undefined,
    now,
  });
  stores.push(store);
  return { db, store };
}

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  for (const db of dbs.splice(0)) db.close();
  vi.restoreAllMocks();
});

describe('GuestStore: reading', () => {
  it('starts not ready and empty', () => {
    const { store } = open(freshName());
    expect(store.getSnapshot()).toMatchObject({
      ready: false,
      welcomeSeen: false,
      hasActivity: false,
      nudge: { actions: 0 },
    });
  });

  it('is ready and empty on a fresh browser, and tells subscribers', async () => {
    const { store } = open(freshName());
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      welcomeSeen: false,
      hasActivity: false,
    });
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the snapshot identity when a re-read changes nothing', async () => {
    const { store } = open(freshName());
    await store.load();
    const before = store.getSnapshot();
    await store.load();
    expect(store.getSnapshot()).toBe(before);
  });

  it.each([
    [
      'saved place',
      (db: LocalDb) =>
        db.progress.put({
          bookId: 'a',
          position: 5,
          duration: 100,
          speed: 1,
          finished: false,
          updatedAt: 1,
        }),
    ],
    [
      'like',
      (db: LocalDb) => db.likes.put({ bookId: 'a', addedAt: 1, updatedAt: 1, deviceId: 'd' }),
    ],
    [
      'removed like (a tombstone)',
      (db: LocalDb) =>
        db.likes.put({ bookId: 'a', addedAt: 1, updatedAt: 2, deviceId: 'd', deletedAt: 2 }),
    ],
    [
      'Listen later',
      (db: LocalDb) => db.listenLater.put({ bookId: 'a', addedAt: 1, updatedAt: 1, deviceId: 'd' }),
    ],
    [
      'history',
      (db: LocalDb) =>
        db.history.put({ bookId: 'a', startedAt: 1, lastPlayedAt: 1, updatedAt: 1, deviceId: 'd' }),
    ],
  ])('sees earlier listening data (%s) as activity', async (_name, write) => {
    const name = freshName();
    const first = open(name);
    await write(first.db);
    const { store } = open(name);
    await store.load();
    expect(store.getSnapshot().hasActivity).toBe(true);
  });
});

describe('GuestStore: the welcome screen', () => {
  it('marking it seen shows at once and survives a new store (a reload)', async () => {
    const name = freshName();
    const first = open(name);
    await first.store.load();
    const done = first.store.markWelcomeSeen();
    expect(first.store.getSnapshot().welcomeSeen).toBe(true);
    await done;

    const second = open(name);
    await second.store.load();
    expect(second.store.getSnapshot().welcomeSeen).toBe(true);
  });

  it('does not write over the first time it was seen', async () => {
    const name = freshName();
    const { store, db } = open(name);
    await store.markWelcomeSeen();
    const first = (await db.meta.get('welcomeSeenAt'))?.value;
    clock += 5000;
    await store.markWelcomeSeen();
    expect((await db.meta.get('welcomeSeenAt'))?.value).toBe(first);
  });

  it('a second tab hears that the first one skipped it', async () => {
    const name = freshName();
    const a = open(name, { channel: `ch-${name}` });
    const b = open(name, { channel: `ch-${name}` });
    await a.store.load();
    await b.store.load();
    expect(b.store.getSnapshot().welcomeSeen).toBe(false);

    await a.store.markWelcomeSeen();
    await wait();
    expect(b.store.getSnapshot().welcomeSeen).toBe(true);
  });

  it('keeps it seen for the session when saving fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo: GuestRepo = {
      load: async () => ({ welcomeSeenAt: undefined, nudge: { actions: 0 }, hasActivity: false }),
      markWelcomeSeen: async () => {
        throw new Error('disk full');
      },
      addAction: async () => ({ actions: 1 }),
      dismiss: async () => ({ actions: 0 }),
    };
    const { store } = open(freshName(), { repo });
    await store.load();
    await store.markWelcomeSeen();
    expect(store.getSnapshot().welcomeSeen).toBe(true);
  });
});

describe('GuestStore: the nudge counter', () => {
  it('counts an add at once and saves it', async () => {
    const name = freshName();
    const { store } = open(name);
    await store.load();
    const saved = store.recordAdd();
    expect(store.getSnapshot().nudge.actions).toBe(1);
    await saved;

    const again = open(name);
    await again.store.load();
    expect(again.store.getSnapshot().nudge.actions).toBe(1);
  });

  it('three quick adds are three, in order', async () => {
    const name = freshName();
    const { store } = open(name);
    await store.load();
    await Promise.all([store.recordAdd(), store.recordAdd(), store.recordAdd()]);
    expect(store.getSnapshot().nudge.actions).toBe(3);
    const again = open(name);
    await again.store.load();
    expect(again.store.getSnapshot().nudge.actions).toBe(3);
  });

  it('counts adds made before the first read has finished', async () => {
    const { store } = open(freshName());
    const saved = store.recordAdd(); // no load() yet
    expect(store.getSnapshot().nudge.actions).toBe(1);
    await saved;
    await store.load();
    expect(store.getSnapshot().nudge.actions).toBe(1);
  });

  it('two tabs adding at the same time lose nothing', async () => {
    const name = freshName();
    const a = open(name);
    const b = open(name);
    await Promise.all([a.store.load(), b.store.load()]);
    await Promise.all([
      a.store.recordAdd(),
      b.store.recordAdd(),
      a.store.recordAdd(),
      b.store.recordAdd(),
    ]);
    await Promise.all([a.store.load(), b.store.load()]);
    expect(a.store.getSnapshot().nudge.actions).toBe(4);
    expect(b.store.getSnapshot().nudge.actions).toBe(4);
  });

  it('a read that finishes while a write is queued cannot take the count back', async () => {
    const name = freshName();
    const { store } = open(name, { channel: `ch-${name}` });
    await store.load();
    const saved = store.recordAdd();
    const read = store.load();
    expect(store.getSnapshot().nudge.actions).toBe(1);
    await Promise.all([saved, read]);
    expect(store.getSnapshot().nudge.actions).toBe(1);
  });

  it('the other tab sees the new count', async () => {
    const name = freshName();
    const a = open(name, { channel: `ch-${name}` });
    const b = open(name, { channel: `ch-${name}` });
    await a.store.load();
    await b.store.load();
    await a.store.recordAdd();
    await wait();
    expect(b.store.getSnapshot().nudge.actions).toBe(1);
  });

  it('keeps counting for the session when saving fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo: GuestRepo = {
      load: async () => ({ welcomeSeenAt: undefined, nudge: { actions: 0 }, hasActivity: false }),
      markWelcomeSeen: async () => 1,
      addAction: async () => {
        throw new Error('disk full');
      },
      dismiss: async () => ({ actions: 0 }),
    };
    const { store } = open(freshName(), { repo });
    await store.load();
    await store.recordAdd();
    await store.recordAdd();
    expect(store.getSnapshot().nudge.actions).toBe(2);
  });
});

describe('GuestStore: dismissing the nudge', () => {
  async function withThree(name: string, channel?: string) {
    const opened = open(name, { channel });
    await opened.store.load();
    for (let i = 0; i < 3; i += 1) await opened.store.recordAdd();
    return opened;
  }

  it('hides it at once and remembers when and at which count', async () => {
    const { store } = await withThree(freshName());
    expect(nudgeDue(store.getSnapshot().nudge, clock)).toBe(true);

    const saved = store.dismissNudge();
    expect(nudgeDue(store.getSnapshot().nudge, clock)).toBe(false);
    await saved;
    expect(store.getSnapshot().nudge).toEqual({
      actions: 3,
      dismissedAt: clock,
      actionsAtDismiss: 3,
    });
  });

  it('is still hidden after a reload, and comes back after 10 more adds', async () => {
    const name = freshName();
    const first = await withThree(name);
    await first.store.dismissNudge();

    const { store } = open(name);
    await store.load();
    expect(nudgeDue(store.getSnapshot().nudge, clock)).toBe(false);
    for (let i = 0; i < NUDGE_SNOOZE_ACTIONS; i += 1) await store.recordAdd();
    expect(nudgeDue(store.getSnapshot().nudge, clock)).toBe(true);
  });

  it('a dismissal in one tab hides it in the other', async () => {
    const name = freshName();
    const channel = `ch-${name}`;
    const a = await withThree(name, channel);
    const b = open(name, { channel });
    await b.store.load();
    expect(nudgeDue(b.store.getSnapshot().nudge, clock)).toBe(true);

    await a.store.dismissNudge();
    await wait();
    expect(nudgeDue(b.store.getSnapshot().nudge, clock)).toBe(false);
  });

  it('a dismissal that could not be saved still holds for the session', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo: GuestRepo = {
      load: async () => ({ welcomeSeenAt: undefined, nudge: { actions: 3 }, hasActivity: false }),
      markWelcomeSeen: async () => 1,
      addAction: async () => ({ actions: 4 }),
      dismiss: async () => {
        throw new Error('disk full');
      },
    };
    const { store } = open(freshName(), { repo });
    await store.load();
    await store.dismissNudge();
    expect(nudgeDue(store.getSnapshot().nudge, clock)).toBe(false);
  });
});

describe('GuestStore: storage that is not there', () => {
  it('becomes ready with empty values when reading fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo: GuestRepo = {
      load: async () => {
        throw new Error('no indexeddb');
      },
      markWelcomeSeen: async () => 1,
      addAction: async () => ({ actions: 1 }),
      dismiss: async () => ({ actions: 0 }),
    };
    const { store } = open(freshName(), { repo });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({
      ready: true,
      welcomeSeen: false,
      nudge: { actions: 0 },
    });
  });
});
