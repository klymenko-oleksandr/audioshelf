// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibraryStore } from '@/features/library/store/library-store';
import { createDexieProgressStore } from '@/features/player/storage/local-db';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import { createDexieSettingsRepo } from '@/features/settings/store';
import { LocalDb } from '@/lib/local-db/db';
import type { SettingKey } from '@/features/settings/definitions';
import type { ChangedKind } from './apply';
import {
  BEACON_BYTES,
  PLAYING_INTERVAL_MS,
  PUSH_URL,
  REQUEST_TIMEOUT_MS,
  RETRY_FIRST_MS,
  RETRY_MAX_MS,
  SIGN_OUT_FLUSH_MS,
  SOON_MS,
  SyncClient,
  type SyncAccountState,
} from './client';
import { cursorKey } from './identity';
import { OWNER_KEY } from './outbox';
import { fakeSyncServer, SERVER_NOW, type FakeSyncServer } from './test-support';
import type { PushBody } from './wire';

const BOOK = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';
const A = 'account-a';
const B = 'account-b';

const settle = async (client: { idle(): Promise<unknown> }) => {
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    await client.idle();
  }
};

const clients: SyncClient[] = [];

/** One browser: its database, account and player, talking to `server`. */
function browser(server: FakeSyncServer, options: { skewMs?: number } = {}) {
  const db = new LocalDb(`sync-${Math.random()}`);
  const now = () => Date.now() + (options.skewMs ?? 0);
  let account: SyncAccountState = { status: 'signedOut' };
  const accountListeners = new Set<() => void>();
  let playing = false;
  let bookId: string | null = null;
  let chapterIndex = 0;
  const playerListeners = new Set<() => void>();
  let tabOwner: string | null = null;
  const player = {
    flush: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    reset: vi.fn(() => {}),
    getState: () => ({ playing, bookId, chapterIndex }),
    subscribe: (listener: () => void) => {
      playerListeners.add(listener);
      return () => playerListeners.delete(listener);
    },
  };
  const changes: ReadonlySet<ChangedKind>[] = [];
  const beacons: PushBody[] = [];
  const progress = createDexieProgressStore(db, { now, tabOwner: () => tabOwner });
  const library = createLibraryStore(db, { now });
  const settingsRepo = createDexieSettingsRepo(db);
  const client = new SyncClient({
    db,
    fetch: (url, init) => server.fetch(url, init),
    beacon: (url, body) => {
      expect(url).toBe(PUSH_URL);
      beacons.push(JSON.parse(body) as PushBody);
      return true;
    },
    now,
    account: {
      getState: () => account,
      subscribe: (listener) => {
        accountListeners.add(listener);
        return () => accountListeners.delete(listener);
      },
    },
    player,
    deviceName: 'Chrome on macOS',
    onChanged: (kinds) => void changes.push(kinds),
    setTabOwner: (owner) => (tabOwner = owner),
  });
  // `idle` is the client's own queue.
  const idle = () => (client as unknown as { queue: Promise<unknown> }).queue;
  const handle = { idle };
  clients.push(client);

  const self = {
    db,
    client,
    player,
    changes,
    beacons,
    progress,
    library,
    tabOwner: () => tabOwner,
    settle: () => settle(handle),
    async setAccount(next: SyncAccountState) {
      account = next;
      server.user = next.status === 'signedIn' ? next.id : server.user;
      for (const listener of accountListeners) listener();
      await settle(handle);
    },
    async signIn(id: string) {
      server.user = id;
      await self.setAccount({ status: 'signedIn', id });
    },
    async signOut() {
      const before = client.beforeSignOut();
      await settle(handle);
      await before;
      server.user = null;
      await self.setAccount({ status: 'signedOut' });
    },
    async play(next: { playing: boolean; bookId?: string; chapterIndex?: number }) {
      playing = next.playing;
      bookId = next.bookId ?? bookId;
      chapterIndex = next.chapterIndex ?? chapterIndex;
      for (const listener of playerListeners) listener();
      await settle(handle);
    },
    async advance(ms: number) {
      await vi.advanceTimersByTimeAsync(ms);
      await settle(handle);
    },
    async start() {
      await client.start();
      await settle(handle);
    },
    place: (position: number, extra: Partial<ProgressRecord> = {}): ProgressRecord => ({
      bookId: BOOK,
      position,
      duration: 3600,
      speed: 1,
      finished: false,
      updatedAt: now(),
      ...extra,
    }),
    setting: (key: SettingKey, value: unknown) =>
      settingsRepo.put({ key, value, updatedAt: now(), deviceId: 'local' }),
    likes: async () => (await library.likes.list()).map((row) => row.bookId).sort(),
    outbox: async () => (await db.outbox.toArray()).map((row) => `${row.owner}/${row.key}`).sort(),
  };
  return self;
}

beforeEach(() => {
  // IndexedDB needs the real `setImmediate`.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(SERVER_NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const client of clients.splice(0)) client.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const server = () => fakeSyncServer({ now: () => Date.now() });

describe('a guest', () => {
  it('makes no requests, whatever happens', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.progress.put(a.place(10));
    await a.library.likes.add(BOOK);
    await a.play({ playing: true, bookId: BOOK });
    await a.advance(PLAYING_INTERVAL_MS * 3);
    await a.play({ playing: false });
    await a.client.hidden();
    await a.client.reconnected();
    await a.client.focused();
    await a.advance(RETRY_MAX_MS);
    expect(s.requests).toBe(0);
    expect(a.beacons).toEqual([]);
    expect(await a.likes()).toEqual([BOOK]);
  });
});

describe('a stopped client', () => {
  it('stays stopped when it is disposed while still starting', async () => {
    const s = server();
    const a = browser(s);
    const starting = a.client.start();
    a.client.dispose();
    await starting;
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    await a.advance(RETRY_MAX_MS);
    expect(s.requests).toBe(0);
    expect(await a.db.meta.get(OWNER_KEY)).toBeUndefined();
  });
});

describe('push', () => {
  it('sends a change shortly after it is made and empties the outbox on 200', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    s.pushes.length = 0;

    await a.library.likes.add(BOOK);
    expect(s.pushes).toHaveLength(0);
    await a.advance(SOON_MS);
    expect(s.pushes).toHaveLength(1);
    expect(s.pushes[0]).toMatchObject({
      deviceName: 'Chrome on macOS',
      clientNow: Date.now(),
      changes: { flags: [{ bookId: BOOK, kind: 'like' }] },
    });
    expect(s.pushes[0]!.merge).toBeUndefined();
    expect(s.pushes[0]!.deviceId).toBe((await a.db.meta.get('deviceId'))!.value);
    expect(await a.outbox()).toEqual([]);
  });

  it('sends positions every 30 s while playing, not on every save', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.play({ playing: true, bookId: BOOK });
    s.pushes.length = 0;

    for (let second = 5; second < 30; second += 5) {
      await a.advance(5000);
      await a.progress.put(a.place(second));
    }
    expect(s.pushes).toHaveLength(0);
    await a.advance(5000);
    expect(s.pushes).toHaveLength(1);
    expect(s.pushes[0]!.changes.progress[0]!.position).toBe(25);

    await a.progress.put(a.place(40));
    await a.advance(PLAYING_INTERVAL_MS);
    expect(s.pushes).toHaveLength(2);
  });

  it('sends at once on pause and on a chapter change, and stops the timer', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.play({ playing: true, bookId: BOOK });
    s.pushes.length = 0;

    await a.progress.put(a.place(10));
    await a.play({ playing: true, chapterIndex: 1 });
    await a.advance(SOON_MS);
    expect(s.pushes).toHaveLength(1);

    await a.progress.put(a.place(20));
    await a.play({ playing: false });
    await a.advance(SOON_MS);
    expect(s.pushes).toHaveLength(2);
    const requests = s.requests;
    await a.advance(PLAYING_INTERVAL_MS * 3);
    expect(s.requests).toBe(requests);
  });

  it('keeps the rows and retries with a growing delay', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    s.requests = 0;
    s.failures = ['offline', 503, 500];

    await a.library.likes.add(BOOK);
    await a.advance(SOON_MS);
    expect(s.requests).toBe(1);
    expect(await a.outbox()).toHaveLength(1);

    // A new change waits for the retry instead of hammering a server that is down.
    await a.library.likes.add(OTHER);
    await a.advance(SOON_MS);
    expect(s.requests).toBe(1);

    await a.advance(RETRY_FIRST_MS - SOON_MS);
    expect(s.requests).toBe(2);
    await a.advance(RETRY_FIRST_MS * 2 - 1);
    expect(s.requests).toBe(2);
    await a.advance(1);
    expect(s.requests).toBe(3);
    await a.advance(RETRY_FIRST_MS * 4);
    expect(await a.outbox()).toEqual([]);
    expect([...s.state(A).flags.values()]).toHaveLength(2);
  });

  it('retries at once when the connection comes back, starting the delays again', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    s.failures = Array<'offline'>(20).fill('offline');
    await a.library.likes.add(BOOK);
    await a.advance(SOON_MS);
    for (let i = 0; i < 6; i++) await a.advance(RETRY_MAX_MS);
    expect(await a.outbox()).toHaveLength(1);

    s.failures = [];
    await a.client.reconnected();
    await a.settle();
    expect(await a.outbox()).toEqual([]);
  });

  it('stops at a 401 and keeps the rows', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    s.user = null;
    s.requests = 0;
    await a.advance(SOON_MS);
    await a.advance(RETRY_MAX_MS);
    expect(s.requests).toBe(1);
    expect(await a.outbox()).toHaveLength(1);
  });

  it('discards what the server dropped', async () => {
    const s = server();
    s.unknownBooks.add(BOOK);
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    await a.library.likes.add(OTHER);
    await a.advance(SOON_MS);
    expect(await a.outbox()).toEqual([]);
    expect([...s.state(A).flags.keys()]).toEqual([`${OTHER}:like`]);
  });

  it('keeps a row that changed while it was being sent', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.progress.put(a.place(10));
    s.during = async (url) => {
      if (url !== PUSH_URL) return;
      s.during = undefined;
      await a.progress.put(a.place(20, { updatedAt: Date.now() + 1 }));
    };
    await a.advance(SOON_MS);
    await a.advance(SOON_MS);
    expect(s.state(A).progress.get(BOOK)!.position).toBe(20);
    expect(await a.outbox()).toEqual([]);
  });

  it('sends everything in requests of at most 500', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    const rows = Array.from({ length: 620 }, (_, n) => ({
      bookId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      addedAt: 1,
      updatedAt: 1,
      deviceId: 'd',
    }));
    await a.db.likes.bulkPut(rows);
    await a.signIn(A);
    expect(s.pushes.map((p) => p.changes.flags.length)).toEqual([500, 120]);
    expect(await a.outbox()).toEqual([]);
  });

  it('uses a beacon when the tab is hidden: saved first, positions first, rows kept', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    s.failures = Array<'offline'>(5).fill('offline');
    await a.db.outbox.bulkPut(
      Array.from({ length: 480 }, (_, n) => {
        const bookId = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        return {
          owner: A,
          key: `flag:${bookId}:like`,
          kind: 'flag' as const,
          merge: false,
          version: 'v',
          item: { bookId, kind: 'like' as const, addedAt: 1, updatedAt: 1 },
        };
      }),
    );
    a.player.flush.mockImplementationOnce(() => a.progress.put(a.place(77)));
    await a.client.hidden();

    expect(a.beacons).toHaveLength(1);
    expect(a.beacons[0]!.changes.progress[0]!.position).toBe(77);
    expect(new Blob([JSON.stringify(a.beacons[0])]).size).toBeLessThan(BEACON_BYTES + 1000);
    expect(await a.outbox()).toHaveLength(481);
  });
});

describe('first sign-in', () => {
  it('pushes everything on the device as a merge, then pulls', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.progress.put(a.place(100));
    await a.library.likes.add(BOOK);
    await a.library.listenLater.add(OTHER);
    await a.library.history.start(BOOK);
    await a.setting('theme', 'dark');

    const order: string[] = [];
    s.during = (url) => void order.push(url.split('?')[0]!);
    await a.signIn(A);

    expect(order).toEqual(['/api/sync/push', '/api/sync/pull']);
    expect(s.pushes[0]!.merge).toBe(true);
    expect(s.state(A).progress.get(BOOK)!.position).toBe(100);
    expect(s.state(A).flags.size).toBe(2);
    expect(s.state(A).history.size).toBe(1);
    expect(s.state(A).settings.get('theme')!.value).toBe('dark');
    // Guests keep everything.
    expect(await a.likes()).toEqual([BOOK]);
    expect(await a.progress.all()).toHaveLength(1);
    expect(a.tabOwner()).toBe(A);
  });

  it('keeps the furthest position and the finish, even when the older write has them', async () => {
    const s = server();
    const phone = browser(s);
    await phone.start();
    await phone.signIn(A);
    await phone.progress.put(phone.place(3000, { finished: true }));
    await phone.advance(SOON_MS);

    await vi.advanceTimersByTimeAsync(60_000);
    const laptop = browser(s);
    await laptop.start();
    await laptop.progress.put(laptop.place(50));
    await laptop.signIn(A);

    expect(s.state(A).progress.get(BOOK)).toMatchObject({ position: 3000, finished: true });
    expect((await laptop.progress.all())[0]).toMatchObject({ position: 3000, finished: true });
    expect(laptop.player.refresh).toHaveBeenCalled();
  });

  it('is a union: what a guest removed does not remove it from the account', async () => {
    const s = server();
    const phone = browser(s);
    await phone.start();
    await phone.signIn(A);
    await phone.library.likes.add(BOOK);
    await phone.progress.put(phone.place(10));
    await phone.advance(SOON_MS);

    await vi.advanceTimersByTimeAsync(60_000);
    const laptop = browser(s);
    await laptop.start();
    await laptop.library.likes.add(BOOK);
    await laptop.library.likes.remove(BOOK);
    await laptop.library.likes.add(OTHER);
    await laptop.progress.put(laptop.place(5));
    await laptop.progress.remove(BOOK);
    await laptop.signIn(A);

    expect(await laptop.likes()).toEqual([BOOK, OTHER]);
    expect(await laptop.progress.all()).toMatchObject([{ bookId: BOOK, position: 10 }]);
  });

  it('merges settings key by key', async () => {
    const s = server();
    const phone = browser(s);
    await phone.start();
    await phone.signIn(A);
    await phone.setting('theme', 'light');
    await phone.setting('defaultSpeed', 1.5);
    await phone.advance(SOON_MS);

    await vi.advanceTimersByTimeAsync(60_000);
    const laptop = browser(s);
    await laptop.start();
    await laptop.setting('theme', 'dark');
    await laptop.setting('autoRewind', false);
    await laptop.signIn(A);

    const values = Object.fromEntries(
      (await laptop.db.settings.toArray()).map((row) => [row.key, row.value]),
    );
    expect(values).toEqual({ theme: 'dark', defaultSpeed: 1.5, autoRewind: false });
  });

  it('does not pull before the merge push got through', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.library.likes.add(BOOK);
    s.failures = ['offline'];
    await a.signIn(A);
    expect(s.pulls).toEqual([]);
    await a.advance(RETRY_FIRST_MS);
    expect(s.pushes.at(-1)!.merge).toBe(true);
    expect(s.pulls).toHaveLength(1);
  });

  it('loses no position saved while the account is being taken on', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    // A save that lands between "signed in" and the tables changing hands.
    const adopting = vi.spyOn(a.db, 'transaction');
    let saved: Promise<void> | undefined;
    adopting.mockImplementation(function (this: unknown, ...args: unknown[]) {
      if (Array.isArray(args[1]) && args[1].includes(a.db.outbox) && !saved) {
        adopting.mockRestore();
        saved = a.progress.put(a.place(321));
      }
      return (LocalDb.prototype.transaction as (...x: unknown[]) => never).apply(a.db, args);
    } as never);
    await a.signIn(A);
    await saved;
    await a.advance(SOON_MS);
    expect(await a.progress.all()).toMatchObject([{ position: 321 }]);
    expect(s.state(A).progress.get(BOOK)!.position).toBe(321);
  });

  it('merges once: the next app open pushes nothing again', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.library.likes.add(BOOK);
    await a.signIn(A);
    a.client.dispose();
    s.pushes.length = 0;
    await a.start();
    expect(s.pushes).toEqual([]);
  });
});

describe('pull', () => {
  async function pair(options: { skewMs?: number; pageSize?: number } = {}) {
    const s = fakeSyncServer({ now: () => Date.now(), pageSize: options.pageSize });
    const phone = browser(s);
    const laptop = browser(s, { skewMs: options.skewMs });
    await phone.start();
    await phone.signIn(A);
    await laptop.start();
    await laptop.signIn(A);
    const send = async () => {
      await phone.advance(SOON_MS);
    };
    const tick = () => vi.advanceTimersByTimeAsync(1000);
    return { s, phone, laptop, send, tick };
  }

  it('brings changes from another device on focus and tells the stores and the player', async () => {
    const { phone, laptop, send, tick } = await pair();
    await tick();
    await phone.progress.put(phone.place(900));
    await phone.library.likes.add(OTHER);
    await send();
    laptop.changes.length = 0;
    laptop.player.refresh.mockClear();

    await laptop.client.focused();
    await laptop.settle();

    expect(await laptop.progress.all()).toMatchObject([{ position: 900 }]);
    expect(await laptop.likes()).toEqual([OTHER]);
    expect([...laptop.changes[0]!].sort()).toEqual(['flags', 'progress']);
    expect(laptop.player.refresh).toHaveBeenCalledTimes(1);
    // What arrived is not queued to go back.
    expect(await laptop.outbox()).toEqual([]);
  });

  it('brings removals, a cleared place included', async () => {
    const { phone, laptop, send, tick } = await pair();
    await phone.progress.put(phone.place(900));
    await phone.library.likes.add(BOOK);
    await send();
    await laptop.client.focused();
    await laptop.settle();

    await tick();
    await phone.progress.remove(BOOK);
    await phone.library.likes.remove(BOOK);
    await send();
    await laptop.client.focused();
    await laptop.settle();

    expect(await laptop.progress.all()).toEqual([]);
    expect(await laptop.likes()).toEqual([]);
  });

  it('never overwrites a newer local change', async () => {
    const { s, phone, laptop, send, tick } = await pair();
    await phone.progress.put(phone.place(100));
    await send();
    await tick();
    // The laptop is offline, plays further, then comes back.
    s.failures = ['offline'];
    await laptop.progress.put(laptop.place(200));
    await laptop.advance(SOON_MS);
    await laptop.client.pull();
    await laptop.settle();
    expect((await laptop.progress.all())[0]!.position).toBe(200);
    expect(await laptop.outbox()).toHaveLength(1);
  });

  it('keeps a change made while the first pull is on its way', async () => {
    const s = server();
    const phone = browser(s);
    await phone.start();
    await phone.signIn(A);
    await phone.progress.put(phone.place(100));
    await phone.advance(SOON_MS);

    await vi.advanceTimersByTimeAsync(1000);
    const laptop = browser(s);
    await laptop.start();
    s.during = async (url) => {
      if (url === PUSH_URL) return;
      s.during = undefined;
      await vi.advanceTimersByTimeAsync(10);
      await laptop.progress.put(laptop.place(555));
    };
    await laptop.signIn(A);
    expect((await laptop.progress.all())[0]!.position).toBe(555);
  });

  it('skips what this device wrote itself', async () => {
    const { s, laptop, tick } = await pair();
    await tick();
    await laptop.progress.put(laptop.place(40, { pausedAt: Date.now() }));
    await laptop.advance(SOON_MS);
    const before = await laptop.db.progress.get(BOOK);
    laptop.changes.length = 0;
    s.pulls.length = 0;

    await laptop.client.focused();
    await laptop.settle();

    expect(s.pulls).toHaveLength(1);
    expect(await laptop.db.progress.get(BOOK)).toEqual(before);
    expect(laptop.changes).toEqual([]);
  });

  it('reads page after page and keeps the cursor per account', async () => {
    const { s, phone, laptop, send } = await pair({ pageSize: 2 });
    for (const bookId of [BOOK, OTHER, THIRD]) {
      await phone.library.likes.add(bookId);
      await phone.library.listenLater.add(bookId);
    }
    await send();
    s.pulls.length = 0;
    await laptop.client.focused();
    await laptop.settle();

    expect(s.pulls).toHaveLength(3);
    expect(await laptop.likes()).toEqual([BOOK, OTHER, THIRD]);
    const cursor = (await laptop.db.meta.get(cursorKey(A)))!.value as { since: number };
    s.pulls.length = 0;
    await laptop.client.focused();
    await laptop.settle();
    expect(s.pulls).toEqual([{ user: A, since: cursor.since }]);
  });

  it('puts times on this device’s clock', async () => {
    const { phone, laptop, send } = await pair({ skewMs: -3_600_000 });
    await phone.progress.put(phone.place(10));
    await send();
    const sentAt = (await phone.db.progress.get(BOOK))!.updatedAt;
    await laptop.client.focused();
    await laptop.settle();
    expect((await laptop.db.progress.get(BOOK))!.updatedAt).toBe(sentAt - 3_600_000);
  });

  it('leaves the cursor alone when a request fails', async () => {
    const { s, phone, laptop, send } = await pair();
    await phone.library.likes.add(BOOK);
    await send();
    s.failures = [503];
    await laptop.client.pull();
    await laptop.settle();
    expect(await laptop.likes()).toEqual([]);
    await laptop.client.pull();
    await laptop.settle();
    expect(await laptop.likes()).toEqual([BOOK]);
  });
});

describe('sign-out', () => {
  it('sends what is waiting, then leaves nothing of the account', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.progress.put(a.place(10));
    await a.library.likes.add(BOOK);
    await a.library.listenLater.add(OTHER);
    await a.library.history.start(BOOK);
    await a.setting('theme', 'dark');
    await a.db.meta.put({ key: 'welcomeSeenAt', value: 1 });
    const deviceId = (await a.db.meta.get('deviceId'))!.value;
    a.changes.length = 0;
    a.player.reset.mockClear();

    await a.signOut();

    expect(s.state(A).flags.size).toBe(2);
    for (const table of [
      a.db.progress,
      a.db.likes,
      a.db.listenLater,
      a.db.history,
      a.db.settings,
    ]) {
      expect(await table.count()).toBe(0);
    }
    expect(await a.db.meta.get(OWNER_KEY)).toBeUndefined();
    expect(await a.db.meta.get(cursorKey(A))).toBeUndefined();
    expect((await a.db.meta.get('deviceId'))!.value).toBe(deviceId);
    expect(await a.db.meta.get('welcomeSeenAt')).toBeDefined();
    expect(await a.outbox()).toEqual([]);
    expect(a.player.reset).toHaveBeenCalled();
    expect(a.tabOwner()).toBeNull();
    expect([...a.changes.at(-1)!].sort()).toEqual(['flags', 'history', 'progress', 'settings']);
  });

  it('keeps unsent changes for that account only, and sends them when it returns', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    s.failures = Array<'offline'>(3).fill('offline');
    await a.library.likes.add(BOOK);
    await a.signOut();
    expect(await a.outbox()).toEqual([`${A}/flag:${BOOK}:like`]);
    expect(await a.likes()).toEqual([]);

    s.failures = [];
    s.pushes.length = 0;
    await a.signIn(B);
    expect(s.pushes).toEqual([]);
    expect(s.state(B).flags.size).toBe(0);
    await a.signOut();

    await a.signIn(A);
    expect(s.state(A).flags.size).toBe(1);
    expect(await a.likes()).toEqual([BOOK]);
    expect(await a.outbox()).toEqual([]);
  });

  it('reads everything again after signing back in', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.progress.put(a.place(10));
    await a.library.likes.add(BOOK);
    await a.signOut();
    s.pulls.length = 0;
    await a.signIn(A);
    expect(s.pulls[0]).toEqual({ user: A, since: 0 });
    expect(await a.likes()).toEqual([BOOK]);
    expect(await a.progress.all()).toMatchObject([{ position: 10 }]);
  });

  it('does not wait long for a request that hangs', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    let release: () => void = () => {};
    s.during = () => new Promise<void>((resolve) => (release = resolve));
    await a.library.likes.add(BOOK);
    let done = false;
    const before = a.client.beforeSignOut().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(SIGN_OUT_FLUSH_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await before;
    expect(done).toBe(true);
    release();
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(SIGN_OUT_FLUSH_MS);
  });

  it('is the same when the session ended elsewhere, found at app open', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    await a.advance(SOON_MS);
    a.client.dispose();

    await a.start(); // the account state is "signed out" or still the old one
    await a.setAccount({ status: 'signedOut' });
    expect(await a.likes()).toEqual([]);
  });

  it('removes nothing while it is not known who is listening', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    await a.advance(SOON_MS);
    const requests = s.requests;

    await a.setAccount({ status: 'unknown' });
    await a.library.likes.add(OTHER);
    await a.progress.put(a.place(10));
    await a.advance(RETRY_MAX_MS);

    expect(await a.likes()).toEqual([BOOK, OTHER]);
    expect(await a.outbox()).toHaveLength(2);
    expect(s.requests).toBe(requests);
  });

  it('switches from one account to another without mixing them', async () => {
    const s = server();
    const a = browser(s);
    await a.start();
    await a.signIn(A);
    await a.library.likes.add(BOOK);
    await a.advance(SOON_MS);
    await a.signIn(B);
    expect(await a.likes()).toEqual([]);
    expect(s.state(B).flags.size).toBe(0);
  });
});
