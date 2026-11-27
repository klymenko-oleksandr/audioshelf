// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { applyPush, highestSeq, listDevices, readChanges, touchDevice } from './data';
import type { Batch } from './merge';
import type { PushRequest } from './request';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const ALICE = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const BOB = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const PHONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LAPTOP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let BOOK: string;
let BOOK2: string;
let BOOK3: string;
const GONE = '99999999-9999-4999-8999-999999999999';

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.client.exec(`
    TRUNCATE sync_progress, sync_flags, sync_history, sync_settings, sync_devices, books CASCADE;
    DELETE FROM auth.users;
    INSERT INTO auth.users (id) VALUES ('${ALICE}'), ('${BOB}');
  `);
  const [a, b, c] = await t.db
    .insert(schema.books)
    .values([
      { slug: 'one', title: 'One' },
      { slug: 'two', title: 'Two', status: 'published' },
      { slug: 'three', title: 'Three', status: 'published', deletedAt: new Date(NOW) },
    ])
    .returning({ id: schema.books.id });
  [BOOK, BOOK2, BOOK3] = [a!.id, b!.id, c!.id];
});

// ── Helpers ────────────────────────────────────────────────────────────────────

const request = (
  o: Partial<Omit<PushRequest, 'changes'>> & { changes?: Partial<Batch> } = {},
): PushRequest => ({
  deviceId: PHONE,
  deviceName: 'Phone',
  clientNow: NOW,
  merge: false,
  ...o,
  changes: { progress: [], flags: [], history: [], settings: [], ...o.changes },
});

const push = (userId: string, req: PushRequest, now = NOW) =>
  t.db.transaction((tx) => applyPush(tx, userId, req, { now: () => now }));

const pull = (userId: string, since = 0, limit?: number, now = NOW) =>
  readChanges(t.db, userId, since, { now: () => now, limit });

const progressItem = (bookId: string, o: Record<string, unknown> = {}) => ({
  bookId,
  position: 120,
  duration: 3600,
  speed: 1,
  finished: false,
  updatedAt: NOW - 5000,
  ...o,
});
const flagItem = (bookId: string, o: Record<string, unknown> = {}) => ({
  bookId,
  kind: 'like' as const,
  addedAt: NOW - 4000,
  updatedAt: NOW - 4000,
  ...o,
});
const historyItem = (bookId: string, o: Record<string, unknown> = {}) => ({
  bookId,
  startedAt: NOW - 9000,
  lastPlayedAt: NOW - 3000,
  updatedAt: NOW - 3000,
  ...o,
});

const all = {
  progress: (userId: string) =>
    t.db.select().from(schema.syncProgress).where(eq(schema.syncProgress.userId, userId)),
  flags: (userId: string) =>
    t.db.select().from(schema.syncFlags).where(eq(schema.syncFlags.userId, userId)),
  history: (userId: string) =>
    t.db.select().from(schema.syncHistory).where(eq(schema.syncHistory.userId, userId)),
  settings: (userId: string) =>
    t.db.select().from(schema.syncSettings).where(eq(schema.syncSettings.userId, userId)),
};

const seqOf = async (userId: string) => {
  const rows = [
    ...(await all.progress(userId)).map((r) => [`p:${r.bookId}`, r.seq] as const),
    ...(await all.flags(userId)).map((r) => [`f:${r.bookId}:${r.kind}`, r.seq] as const),
    ...(await all.history(userId)).map((r) => [`h:${r.bookId}`, r.seq] as const),
    ...(await all.settings(userId)).map((r) => [`s:${r.key}`, r.seq] as const),
  ];
  return Object.fromEntries(rows);
};

// ── Round trip ─────────────────────────────────────────────────────────────────

describe('push then pull', () => {
  it('round-trips every kind of row', async () => {
    const result = await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(BOOK, { position: 321.5, speed: 1.25, dismissedAt: NOW - 1000 })],
          flags: [
            flagItem(BOOK),
            flagItem(BOOK2, { kind: 'listen_later', deletedAt: NOW - 500, updatedAt: NOW - 500 }),
          ],
          history: [historyItem(BOOK, { finishedAt: NOW - 3000 })],
          settings: [
            { key: 'theme', value: 'dark', updatedAt: NOW - 2000 },
            { key: 'defaultSpeed', value: 1.5, updatedAt: NOW - 2000 },
          ],
        },
      }),
    );
    expect(result).toMatchObject({
      serverNow: NOW,
      applied: { progress: 1, flags: 2, history: 1, settings: 2 },
      dropped: [],
    });
    expect(result.cursor).toBeGreaterThan(0);

    const changes = await pull(ALICE);
    expect(changes.hasMore).toBe(false);
    expect(changes.serverNow).toBe(NOW);
    expect(changes.cursor).toBe(result.cursor);
    expect(changes.progress).toEqual([
      {
        bookId: BOOK,
        position: 321.5,
        duration: 3600,
        speed: 1.25,
        finished: false,
        dismissedAt: NOW - 1000,
        deletedAt: null,
        updatedAt: NOW - 5000,
        deviceId: PHONE,
        seq: expect.any(Number),
      },
    ]);
    expect(changes.flags).toHaveLength(2);
    expect(changes.flags).toContainEqual(
      expect.objectContaining({ bookId: BOOK, kind: 'like', addedAt: NOW - 4000, deletedAt: null }),
    );
    expect(changes.history[0]).toMatchObject({
      bookId: BOOK,
      startedAt: NOW - 9000,
      lastPlayedAt: NOW - 3000,
      finishedAt: NOW - 3000,
      deviceId: PHONE,
    });
    expect(changes.settings.map((s) => [s.key, s.value]).sort()).toEqual([
      ['defaultSpeed', 1.5],
      ['theme', 'dark'],
    ]);
  });

  it('a second device sees the first device’s rows with the first device’s id', async () => {
    await push(
      ALICE,
      request({
        deviceId: PHONE,
        deviceName: 'Phone',
        changes: { progress: [progressItem(BOOK)] },
      }),
    );
    // The laptop opens the app: nothing of its own yet, one pull gets the phone's position.
    const seen = await pull(ALICE, 0);
    expect(seen.progress).toHaveLength(1);
    expect(seen.progress[0]).toMatchObject({ bookId: BOOK, position: 120, deviceId: PHONE });
    expect(seen.devices).toEqual([{ id: PHONE, name: 'Phone', lastPushAt: NOW }]);

    // The laptop listens on and pushes; the phone's next pull shows the laptop as the writer.
    await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: { progress: [progressItem(BOOK, { position: 900, updatedAt: NOW - 1000 })] },
      }),
      NOW + 1000,
    );
    const after = await pull(ALICE, seen.cursor);
    expect(after.progress).toHaveLength(1);
    expect(after.progress[0]).toMatchObject({ position: 900, deviceId: LAPTOP });
    expect(after.devices.map((d) => d.name).sort()).toEqual(['Laptop', 'Phone']);
  });

  it('pulls tombstones', async () => {
    await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(BOOK)],
          flags: [flagItem(BOOK)],
          history: [historyItem(BOOK)],
        },
      }),
    );
    const first = await pull(ALICE);
    await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(BOOK, { deletedAt: NOW - 100, updatedAt: NOW - 100 })],
          flags: [flagItem(BOOK, { deletedAt: NOW - 100, updatedAt: NOW - 100 })],
          history: [historyItem(BOOK, { deletedAt: NOW - 100, updatedAt: NOW - 100 })],
        },
      }),
    );
    const next = await pull(ALICE, first.cursor);
    expect(next.progress[0]).toMatchObject({ bookId: BOOK, deletedAt: NOW - 100 });
    expect(next.flags[0]).toMatchObject({ bookId: BOOK, deletedAt: NOW - 100 });
    expect(next.history[0]).toMatchObject({ bookId: BOOK, deletedAt: NOW - 100 });
    // …and an earlier pull still sees the whole story from the start.
    expect((await pull(ALICE)).progress[0]!.deletedAt).toBe(NOW - 100);
  });

  it('an empty pull answers with the cursor it was given', async () => {
    expect(await pull(ALICE, 0)).toMatchObject({
      cursor: 0,
      hasMore: false,
      progress: [],
      flags: [],
      history: [],
      settings: [],
      devices: [],
    });
    expect((await pull(ALICE, 777)).cursor).toBe(777);
  });
});

// ── Merge rules, end to end ────────────────────────────────────────────────────

describe('merge rules in the database', () => {
  it('a newer write replaces an older one and an older one is ignored', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK, { position: 500 })] } }));
    const lost = await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: { progress: [progressItem(BOOK, { position: 7, updatedAt: NOW - 60_000 })] },
      }),
    );
    expect(lost.applied.progress).toBe(0);
    expect((await all.progress(ALICE))[0]).toMatchObject({ positionSeconds: 500, deviceId: PHONE });

    const won = await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: { progress: [progressItem(BOOK, { position: 60, updatedAt: NOW - 1000 })] },
      }),
    );
    expect(won.applied.progress).toBe(1);
    expect((await all.progress(ALICE))[0]).toMatchObject({ positionSeconds: 60, deviceId: LAPTOP });
  });

  it('corrects the device clock before comparing and stores the offset', async () => {
    // The laptop's clock is 10 minutes slow.
    await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        clientNow: NOW - 10 * MIN,
        changes: { progress: [progressItem(BOOK, { updatedAt: NOW - 10 * MIN - 2000 })] },
      }),
    );
    expect((await all.progress(ALICE))[0]!.updatedAt.getTime()).toBe(NOW - 2000);
    const [device] = await t.db.select().from(schema.syncDevices);
    expect(device).toMatchObject({ deviceId: LAPTOP, clockOffsetMs: 10 * MIN });
  });

  it('stores an offset that does not fit a 32-bit column without failing', async () => {
    // A clock stuck in 1970 is 57 years behind: about 1.8e12 ms.
    await push(
      ALICE,
      request({ clientNow: 1000, changes: { progress: [progressItem(BOOK, { updatedAt: 500 })] } }),
    );
    const [device] = await t.db.select().from(schema.syncDevices);
    expect(device!.clockOffsetMs).toBe(2_147_483_647);
    // The correction itself used the exact offset.
    expect((await all.progress(ALICE))[0]!.updatedAt.getTime()).toBe(NOW - 500);
  });

  it('clamps a time far in the future to server now', async () => {
    await push(
      ALICE,
      request({
        changes: {
          flags: [flagItem(BOOK, { addedAt: NOW + 5 * 3600_000, updatedAt: NOW + 5 * 3600_000 })],
        },
      }),
    );
    const [row] = await all.flags(ALICE);
    expect(row!.updatedAt.getTime()).toBe(NOW);
    expect(row!.addedAt.getTime()).toBe(NOW);
  });

  it('merge: true keeps the furthest position and a finished flag', async () => {
    await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: {
          progress: [
            progressItem(BOOK, { position: 3000, finished: true, updatedAt: NOW - 60_000 }),
          ],
        },
      }),
    );
    await push(
      ALICE,
      request({
        merge: true,
        changes: { progress: [progressItem(BOOK, { position: 100, updatedAt: NOW - 1000 })] },
      }),
    );
    expect((await all.progress(ALICE))[0]).toMatchObject({
      positionSeconds: 3000,
      finished: true,
      deviceId: LAPTOP,
    });
  });

  it('history keeps the earliest start and latest last play across devices', async () => {
    await push(
      ALICE,
      request({
        changes: {
          history: [
            historyItem(BOOK, {
              startedAt: NOW - 5000,
              lastPlayedAt: NOW - 2000,
              updatedAt: NOW - 2000,
            }),
          ],
        },
      }),
    );
    await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: {
          history: [
            historyItem(BOOK, {
              startedAt: NOW - 90_000,
              lastPlayedAt: NOW - 80_000,
              updatedAt: NOW - 80_000,
            }),
          ],
        },
      }),
    );
    expect((await all.history(ALICE))[0]).toMatchObject({
      startedAt: new Date(NOW - 90_000),
      lastPlayedAt: new Date(NOW - 2000),
      updatedAt: new Date(NOW - 2000),
      deviceId: PHONE,
    });
  });

  it('settings: only allowed keys and values are stored; the rest are reported', async () => {
    const result = await push(
      ALICE,
      request({
        changes: {
          settings: [
            { key: 'theme', value: 'dark', updatedAt: NOW - 100 },
            { key: 'volume', value: 11, updatedAt: NOW - 100 },
            { key: 'skipBackSeconds', value: 25, updatedAt: NOW - 100 },
          ],
        },
      }),
    );
    expect(result.applied.settings).toBe(1);
    expect(result.dropped).toEqual([
      { kind: 'setting', key: 'volume', reason: 'unknown_setting' },
      { kind: 'setting', key: 'skipBackSeconds', reason: 'invalid_value' },
    ]);
    expect((await all.settings(ALICE)).map((r) => r.key)).toEqual(['theme']);
  });

  it('a push with no name keeps the device’s name; a new name replaces it', async () => {
    await push(ALICE, request({ deviceName: 'Phone' }));
    await push(ALICE, request({ deviceName: '' }));
    expect((await listDevices(t.db, ALICE))[0]!.name).toBe('Phone');
    await push(ALICE, request({ deviceName: 'Sasha’s iPhone' }));
    expect((await listDevices(t.db, ALICE))[0]!.name).toBe('Sasha’s iPhone');
  });
});

// ── Idempotence and seq ────────────────────────────────────────────────────────

describe('seq', () => {
  const full = (): Partial<Batch> => ({
    progress: [progressItem(BOOK), progressItem(BOOK2, { position: 9 })],
    flags: [flagItem(BOOK)],
    history: [historyItem(BOOK)],
    settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 100 }],
  });

  it('every changed row takes a new, higher seq from one sequence', async () => {
    await push(ALICE, request({ changes: full() }));
    const seqs = Object.values(await seqOf(ALICE));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(Math.min(...seqs)).toBeGreaterThan(0);
  });

  it('pushing the same batch twice changes nothing, seq included', async () => {
    const first = await push(ALICE, request({ changes: full() }));
    const before = await seqOf(ALICE);
    const second = await push(
      ALICE,
      request({ clientNow: NOW + 5000, changes: full() }),
      NOW + 5000,
    );
    expect(second.applied).toEqual({ progress: 0, flags: 0, history: 0, settings: 0 });
    expect(await seqOf(ALICE)).toEqual(before);
    expect(second.cursor).toBe(first.cursor);
    // Nothing for a client at the cursor to pull.
    expect(await pull(ALICE, first.cursor)).toMatchObject({
      progress: [],
      flags: [],
      history: [],
      settings: [],
    });
  });

  it('only the row that really changed gets a new seq', async () => {
    await push(ALICE, request({ changes: full() }));
    const before = await seqOf(ALICE);
    await push(
      ALICE,
      request({
        changes: {
          ...full(),
          progress: [
            progressItem(BOOK, { position: 777, updatedAt: NOW - 10 }),
            progressItem(BOOK2, { position: 9 }),
          ],
        },
      }),
    );
    const after = await seqOf(ALICE);
    expect(after[`p:${BOOK}`]).toBeGreaterThan(before[`p:${BOOK}`]!);
    for (const key of Object.keys(before).filter((k) => k !== `p:${BOOK}`)) {
      expect(after[key]).toBe(before[key]);
    }
  });

  it('an older write that loses does not touch the row', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK)] } }));
    const before = await seqOf(ALICE);
    await push(
      ALICE,
      request({
        deviceId: LAPTOP,
        deviceName: 'Laptop',
        changes: { progress: [progressItem(BOOK, { position: 1, updatedAt: NOW - 90_000 })] },
      }),
    );
    expect(await seqOf(ALICE)).toEqual(before);
  });

  it('the push cursor is the highest seq the listener has, and it never goes down', async () => {
    const a = await push(ALICE, request({ changes: { progress: [progressItem(BOOK)] } }));
    const b = await push(ALICE, request({ changes: { flags: [flagItem(BOOK)] } }));
    const c = await push(ALICE, request({ changes: { flags: [flagItem(BOOK)] } }));
    expect(b.cursor).toBeGreaterThan(a.cursor);
    expect(c.cursor).toBe(b.cursor);
    expect(await highestSeq(t.db, ALICE)).toBe(c.cursor);
    expect(await highestSeq(t.db, BOB)).toBe(0);
  });
});

// ── Unknown books ──────────────────────────────────────────────────────────────

describe('books', () => {
  it('drops items for a book that does not exist, reports them and applies the rest', async () => {
    const result = await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(GONE), progressItem(BOOK)],
          flags: [flagItem(GONE), flagItem(BOOK2)],
          history: [historyItem(GONE)],
          settings: [{ key: 'theme', value: 'light', updatedAt: NOW - 100 }],
        },
      }),
    );
    expect(result.applied).toEqual({ progress: 1, flags: 1, history: 0, settings: 1 });
    expect(result.dropped).toEqual([
      { kind: 'progress', bookId: GONE, reason: 'unknown_book' },
      { kind: 'flag', bookId: GONE, reason: 'unknown_book' },
      { kind: 'history', bookId: GONE, reason: 'unknown_book' },
    ]);
    expect((await all.progress(ALICE)).map((r) => r.bookId)).toEqual([BOOK]);
  });

  it('keeps data for an unpublished book and for a soft-deleted one', async () => {
    const result = await push(
      ALICE,
      request({ changes: { progress: [progressItem(BOOK), progressItem(BOOK3)] } }),
    );
    expect(result.applied.progress).toBe(2);
    expect(result.dropped).toEqual([]);
  });

  it('a batch of only unknown books still registers the device', async () => {
    const result = await push(ALICE, request({ changes: { progress: [progressItem(GONE)] } }));
    expect(result.dropped).toHaveLength(1);
    expect(await listDevices(t.db, ALICE)).toHaveLength(1);
  });

  it('rows go when their book or their listener is deleted', async () => {
    await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(BOOK), progressItem(BOOK2)],
          flags: [flagItem(BOOK)],
          history: [historyItem(BOOK)],
        },
      }),
    );
    await t.db.delete(schema.books).where(eq(schema.books.id, BOOK));
    expect((await all.progress(ALICE)).map((r) => r.bookId)).toEqual([BOOK2]);
    expect(await all.flags(ALICE)).toHaveLength(0);
    expect(await all.history(ALICE)).toHaveLength(0);
    await t.client.exec(`DELETE FROM auth.users WHERE id = '${ALICE}'`);
    expect(await all.progress(ALICE)).toHaveLength(0);
    expect(await listDevices(t.db, ALICE)).toHaveLength(0);
  });
});

// ── Listeners are separate ─────────────────────────────────────────────────────

describe('one listener cannot see or change another’s rows', () => {
  it('pull only returns the asking listener’s rows', async () => {
    await push(
      ALICE,
      request({
        changes: {
          progress: [progressItem(BOOK)],
          flags: [flagItem(BOOK)],
          settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 1 }],
        },
      }),
    );
    await push(
      BOB,
      request({
        deviceId: LAPTOP,
        deviceName: 'Bob’s laptop',
        changes: { progress: [progressItem(BOOK2)] },
      }),
    );

    const alice = await pull(ALICE);
    const bob = await pull(BOB);
    expect(alice.progress.map((r) => r.bookId)).toEqual([BOOK]);
    expect(alice.devices.map((d) => d.name)).toEqual(['Phone']);
    expect(bob.progress.map((r) => r.bookId)).toEqual([BOOK2]);
    expect(bob.flags).toEqual([]);
    expect(bob.settings).toEqual([]);
    expect(bob.devices.map((d) => d.name)).toEqual(['Bob’s laptop']);
  });

  it('the same book and the same device id are separate rows per listener', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK, { position: 111 })] } }));
    await push(
      BOB,
      request({
        changes: { progress: [progressItem(BOOK, { position: 222, updatedAt: NOW - 1 })] },
      }),
    );
    expect((await all.progress(ALICE))[0]!.positionSeconds).toBe(111);
    expect((await all.progress(BOB))[0]!.positionSeconds).toBe(222);
    expect(await listDevices(t.db, ALICE)).toHaveLength(1);
    expect(await listDevices(t.db, BOB)).toHaveLength(1);
  });

  it('a push never merges into someone else’s row, even a newer one', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK, { position: 111 })] } }));
    const bobPush = await push(
      BOB,
      request({
        changes: { progress: [progressItem(BOOK, { position: 5, updatedAt: NOW - 90_000 })] },
      }),
    );
    expect(bobPush.applied.progress).toBe(1);
    expect((await all.progress(ALICE))[0]!.positionSeconds).toBe(111);
  });

  it('the cursor is per listener: Bob’s pushes do not move Alice’s', async () => {
    const a = await push(ALICE, request({ changes: { progress: [progressItem(BOOK)] } }));
    await push(BOB, request({ changes: { progress: [progressItem(BOOK)] } }));
    expect(await highestSeq(t.db, ALICE)).toBe(a.cursor);
    expect((await pull(ALICE, a.cursor)).progress).toEqual([]);
  });

  it('touching a device never creates one or touches another listener’s', async () => {
    await touchDevice(t.db, ALICE, PHONE, { now: () => NOW });
    expect(await listDevices(t.db, ALICE)).toEqual([]);
    await push(ALICE, request());
    await touchDevice(t.db, BOB, PHONE, { now: () => NOW + 9000 });
    const [row] = await t.db.select().from(schema.syncDevices);
    expect(row!.lastSeenAt.getTime()).toBe(NOW);
    await touchDevice(t.db, ALICE, PHONE, { now: () => NOW + 9000 });
    const [after] = await t.db.select().from(schema.syncDevices);
    expect(after!.lastSeenAt.getTime()).toBe(NOW + 9000);
    expect(after!.lastPushAt!.getTime()).toBe(NOW);
  });
});

// ── All or nothing ─────────────────────────────────────────────────────────────

describe('a batch is all or nothing', () => {
  it('a failure on the last write leaves nothing behind', async () => {
    await t.client.exec(`
      CREATE FUNCTION fail_setting() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'boom'; END $$;
      CREATE TRIGGER fail_setting BEFORE INSERT ON sync_settings
        FOR EACH ROW EXECUTE FUNCTION fail_setting();
    `);
    try {
      await expect(
        push(
          ALICE,
          request({
            changes: {
              progress: [progressItem(BOOK)],
              flags: [flagItem(BOOK)],
              history: [historyItem(BOOK)],
              settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 1 }],
            },
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await t.client.exec(
        `DROP TRIGGER fail_setting ON sync_settings; DROP FUNCTION fail_setting();`,
      );
    }
    expect(await all.progress(ALICE)).toHaveLength(0);
    expect(await all.flags(ALICE)).toHaveLength(0);
    expect(await all.history(ALICE)).toHaveLength(0);
    expect(await all.settings(ALICE)).toHaveLength(0);
    // Not even the device: a failed push is as if it never happened.
    expect(await listDevices(t.db, ALICE)).toEqual([]);
    expect(await highestSeq(t.db, ALICE)).toBe(0);
  });

  it('a failure does not undo an earlier, successful push', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK)] } }));
    const unknownListener = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
    await expect(
      push(unknownListener, request({ changes: { progress: [progressItem(BOOK)] } })),
    ).rejects.toThrow();
    expect(await all.progress(ALICE)).toHaveLength(1);
    expect(await all.progress(unknownListener)).toHaveLength(0);
  });
});

// ── Paging ─────────────────────────────────────────────────────────────────────

describe('pull paging', () => {
  async function seed() {
    // 3 pushes of mixed kinds, 11 changed rows in all.
    await push(
      ALICE,
      request({
        changes: { progress: [progressItem(BOOK), progressItem(BOOK2), progressItem(BOOK3)] },
      }),
    );
    await push(
      ALICE,
      request({
        changes: {
          flags: [flagItem(BOOK), flagItem(BOOK2), flagItem(BOOK, { kind: 'listen_later' })],
          history: [historyItem(BOOK), historyItem(BOOK2)],
        },
      }),
    );
    await push(
      ALICE,
      request({
        changes: {
          settings: [
            { key: 'theme', value: 'dark', updatedAt: NOW - 1 },
            { key: 'autoRewind', value: false, updatedAt: NOW - 1 },
            { key: 'skipBackSeconds', value: 30, updatedAt: NOW - 1 },
          ],
        },
      }),
    );
  }

  const keyOf = (c: Awaited<ReturnType<typeof pull>>) => [
    ...c.progress.map((r) => `p:${r.bookId}`),
    ...c.flags.map((r) => `f:${r.bookId}:${r.kind}`),
    ...c.history.map((r) => `h:${r.bookId}`),
    ...c.settings.map((r) => `s:${r.key}`),
  ];

  it('cuts at the limit, says hasMore and hands out a cursor that continues exactly', async () => {
    await seed();
    const everything = keyOf(await pull(ALICE));
    expect(everything).toHaveLength(11);

    for (const limit of [1, 2, 3, 4, 10, 11, 12]) {
      const seen: string[] = [];
      let cursor = 0;
      let pages = 0;
      for (;;) {
        const page = await pull(ALICE, cursor, limit);
        expect(page.cursor).toBeGreaterThanOrEqual(cursor);
        expect(keyOf(page).length).toBeLessThanOrEqual(limit);
        seen.push(...keyOf(page));
        cursor = page.cursor;
        pages++;
        if (!page.hasMore) break;
        expect(keyOf(page)).toHaveLength(limit);
        expect(pages).toBeLessThan(30);
      }
      expect([...seen].sort()).toEqual([...everything].sort());
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it('a full page that ends the data does not claim there is more', async () => {
    await seed();
    const page = await pull(ALICE, 0, 11);
    expect(page.hasMore).toBe(false);
    expect(keyOf(page)).toHaveLength(11);
    expect((await pull(ALICE, 0, 10)).hasMore).toBe(true);
  });

  it('pages come oldest first across all kinds', async () => {
    await seed();
    const first = await pull(ALICE, 0, 4);
    const second = await pull(ALICE, first.cursor, 4);
    const seqs = (c: typeof first) =>
      [...c.progress, ...c.flags, ...c.history, ...c.settings]
        .map((r) => r.seq)
        .sort((a, b) => a - b);
    expect(Math.max(...seqs(first))).toBe(first.cursor);
    expect(Math.min(...seqs(second))).toBeGreaterThan(first.cursor);
  });

  it('the default page is 1000 rows', async () => {
    const rows = Array.from({ length: 600 }, (_, i) =>
      t.db
        .insert(schema.books)
        .values({ slug: `bulk-${i}`, title: `Bulk ${i}` })
        .returning({ id: schema.books.id }),
    );
    const ids = (await Promise.all(rows)).map(([r]) => r!.id);
    await push(ALICE, request({ changes: { progress: ids.map((id) => progressItem(id)) } }));
    await push(ALICE, request({ changes: { flags: ids.map((id) => flagItem(id)) } }));
    const first = await readChanges(t.db, ALICE, 0, { now: () => NOW });
    expect(first.progress.length + first.flags.length).toBe(1000);
    expect(first.hasMore).toBe(true);
    const rest = await readChanges(t.db, ALICE, first.cursor, { now: () => NOW });
    expect(rest.progress.length + rest.flags.length).toBe(200);
    expect(rest.hasMore).toBe(false);
  });

  // A pull for every cursor value: dozens of queries, over the default 5 s on a CI runner.
  it('the cursor never goes backwards', async () => {
    await seed();
    const end = (await pull(ALICE)).cursor;
    expect((await pull(ALICE, end)).cursor).toBe(end);
    expect((await pull(ALICE, end + 1000)).cursor).toBe(end + 1000);
    let last = 0;
    for (let since = 0; since <= end + 3; since++) {
      const { cursor } = await pull(ALICE, since, 2);
      expect(cursor).toBeGreaterThanOrEqual(since);
      expect(cursor).toBeGreaterThanOrEqual(last === 0 ? 0 : Math.min(last, since));
      last = cursor;
    }
  }, 30_000);

  it('a row that changes again shows up again after the cursor (re-reading is harmless)', async () => {
    await push(ALICE, request({ changes: { progress: [progressItem(BOOK, { position: 10 })] } }));
    const first = await pull(ALICE);
    await push(
      ALICE,
      request({
        changes: { progress: [progressItem(BOOK, { position: 20, updatedAt: NOW - 1 })] },
      }),
    );
    const again = await pull(ALICE, first.cursor);
    expect(again.progress).toHaveLength(1);
    expect(again.progress[0]).toMatchObject({ position: 20 });
    // A client that re-reads from the start gets one row per item, the latest state.
    expect((await pull(ALICE)).progress).toHaveLength(1);
  });
});

// ── What the migration locks down ──────────────────────────────────────────────

describe('migration 0006', () => {
  const tables = ['sync_devices', 'sync_progress', 'sync_flags', 'sync_history', 'sync_settings'];

  it('turns Row Level Security on for every sync table', async () => {
    const res = await t.client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = any($1) and relkind = 'r'`,
      [tables],
    );
    expect(res.rows).toHaveLength(5);
    expect(res.rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await t.client.query(`select 1 from pg_policies where tablename = any($1)`, [
      tables,
    ]);
    expect(policies.rows).toHaveLength(0);
  });

  it('gives the API roles no access to the tables or the sequence', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of tables) {
        const res = await t.client.query<{ ok: boolean }>(
          `select has_table_privilege($1, $2, 'select, insert, update, delete') as ok`,
          [role, table],
        );
        expect(res.rows[0]!.ok).toBe(false);
      }
      const seq = await t.client.query<{ ok: boolean }>(
        `select has_sequence_privilege($1, 'sync_change_seq', 'usage, select, update') as ok`,
        [role],
      );
      expect(seq.rows[0]!.ok).toBe(false);
    }
  });

  it('has one shared sequence behind every seq column', async () => {
    const res = await t.client.query<{ column_default: string }>(
      `select column_default from information_schema.columns where column_name = 'seq' and table_name like 'sync_%'`,
    );
    expect(res.rows).toHaveLength(4);
    expect(res.rows.every((r) => r.column_default === "nextval('sync_change_seq'::regclass)")).toBe(
      true,
    );
    void sql;
  });
});
