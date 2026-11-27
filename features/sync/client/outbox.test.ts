// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDexieHistoryRepo } from '@/features/library/history/store';
import { createLibraryStore } from '@/features/library/store/library-store';
import { createDexieProgressStore } from '@/features/player/storage/local-db';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import { createDexieSettingsRepo } from '@/features/settings/store';
import { LocalDb } from '@/lib/local-db/db';
import { onQueued, OWNER_KEY, progressChange, queueChange, trackedTables } from './outbox';

const BOOK = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const place = (position: number, extra: Partial<ProgressRecord> = {}): ProgressRecord => ({
  bookId: BOOK,
  position,
  duration: 3600,
  speed: 1,
  finished: false,
  updatedAt: 1000,
  ...extra,
});

async function setup(owner: string | null = 'account-a') {
  const db = new LocalDb(`outbox-${Math.random()}`);
  if (owner) await db.meta.put({ key: OWNER_KEY, value: owner });
  let clock = 5000;
  const now = () => (clock += 1);
  const progress = createDexieProgressStore(db, { now, tabOwner: () => owner });
  const library = createLibraryStore(db, { now });
  const rows = () => db.outbox.toArray();
  const keys = async () => (await rows()).map((row) => row.key).sort();
  return { db, progress, library, rows, keys };
}

describe('outbox: what is queued', () => {
  it('queues nothing for a guest', async () => {
    const { db, progress, library, rows } = await setup(null);
    await progress.put(place(10));
    await library.likes.add(BOOK);
    await library.history.start(BOOK);
    await createDexieSettingsRepo(db).put({
      key: 'theme',
      value: 'dark',
      updatedAt: 1,
      deviceId: 'd',
    });
    expect(await rows()).toEqual([]);
  });

  it('queues every kind of change under its own key, for the account', async () => {
    const { db, progress, library, rows, keys } = await setup();
    await progress.put(place(10));
    await library.likes.add(BOOK);
    await library.listenLater.add(BOOK);
    await library.history.start(BOOK);
    await createDexieSettingsRepo(db).put({
      key: 'theme',
      value: 'dark',
      updatedAt: 1,
      deviceId: 'd',
    });
    expect(await keys()).toEqual([
      `flag:${BOOK}:like`,
      `flag:${BOOK}:listen_later`,
      `history:${BOOK}`,
      `progress:${BOOK}`,
      'setting:theme',
    ]);
    expect((await rows()).every((row) => row.owner === 'account-a' && !row.merge)).toBe(true);
  });

  it('keeps one row per changed thing, with the latest state and a new version', async () => {
    const { progress, library, rows } = await setup();
    await progress.put(place(10));
    const [first] = await rows();
    await progress.put(place(99, { updatedAt: 2000, dismissedAt: 1999.6 }));
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0]!.item).toMatchObject({ position: 99, updatedAt: 2000, dismissedAt: 2000 });
    expect(after[0]!.version).not.toBe(first!.version);

    await library.likes.add(OTHER);
    await library.likes.remove(OTHER);
    const like = (await rows()).filter((row) => row.kind === 'flag');
    expect(like).toHaveLength(1);
    expect(like[0]!.item).toMatchObject({ bookId: OTHER, deletedAt: expect.any(Number) });
  });

  it('queues the removal, the undo, the finish and the History removal', async () => {
    const { library, rows } = await setup();
    await library.likes.add(BOOK);
    const row = (await library.likes.list())[0]!;
    await library.likes.remove(BOOK);
    await library.likes.restore(row);
    expect((await rows())[0]!.item).toMatchObject({ deletedAt: null });

    await library.history.start(BOOK);
    await library.history.finish(BOOK);
    const history = async () => (await rows()).find((r) => r.kind === 'history')!.item;
    expect(await history()).toMatchObject({ finishedAt: expect.any(Number), deletedAt: null });
    await library.history.remove(BOOK);
    expect(await history()).toMatchObject({ deletedAt: expect.any(Number) });
  });

  it('queues nothing when nothing changed', async () => {
    const { library, rows, db } = await setup();
    await library.likes.add(BOOK);
    await db.outbox.clear();
    await library.likes.add(BOOK);
    await library.likes.remove(OTHER);
    await library.history.finish(OTHER);
    expect(await rows()).toEqual([]);
  });

  it('queues the entries the History backfill writes', async () => {
    const { db, keys } = await setup();
    await createDexieHistoryRepo(db).backfill([place(10), place(20, { bookId: OTHER })]);
    expect(await keys()).toEqual([`history:${BOOK}`, `history:${OTHER}`]);
  });

  it('leaves out ids the server would refuse the whole batch for', async () => {
    const { progress, rows } = await setup();
    await progress.put(place(10, { bookId: 'test-book' }));
    expect(await rows()).toEqual([]);
  });

  it('writes the change and the outbox row together, or neither', async () => {
    const { db, rows } = await setup();
    await expect(
      db.transaction('rw', trackedTables(db, db.progress), async () => {
        await db.progress.put(place(10));
        await queueChange(db, progressChange(place(10)));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.progress.count()).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it('does not keep a change whose outbox row cannot be written', async () => {
    const { db, library } = await setup();
    const put = vi.spyOn(db.outbox, 'put').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(library.likes.add(BOOK)).rejects.toThrow('quota');
    expect(await db.likes.count()).toBe(0);
    put.mockRestore();
  });

  it('tells listeners only after the change is committed', async () => {
    const { db, progress } = await setup();
    const seen: string[] = [];
    onQueued(db, (kind) => seen.push(kind));
    await progress.put(place(10));
    expect(seen).toEqual(['progress']);
  });

  it('keeps a row in merge mode until it is sent, except for a removal', async () => {
    const { db, library, rows } = await setup();
    await library.likes.add(BOOK);
    const [row] = await rows();
    await db.outbox.put({ ...row!, merge: true });

    const flag = (await library.likes.list())[0]!;
    await library.likes.remove(BOOK);
    expect((await rows())[0]!.merge).toBe(false);

    await db.outbox.put({ ...(await rows())[0]!, merge: true });
    await library.likes.restore(flag);
    expect((await rows())[0]!.merge).toBe(true);
  });
});

describe('progress tombstones', () => {
  it('hides a cleared place, queues it and brings it back on the next save', async () => {
    const { db, progress, rows } = await setup();
    await progress.put(place(10));
    await progress.remove(BOOK);
    expect(await progress.all()).toEqual([]);
    const stored = await db.progress.get(BOOK);
    expect(stored?.deletedAt).toBe(stored?.updatedAt);
    expect((await rows())[0]!.item).toMatchObject({ deletedAt: stored!.deletedAt });

    await progress.put(place(30, { updatedAt: 9000 }));
    expect(await progress.all()).toEqual([place(30, { updatedAt: 9000 })]);
    expect((await rows())[0]!.item).toMatchObject({ deletedAt: null, position: 30 });
  });

  it('ignores removing what is not there', async () => {
    const { progress, rows } = await setup();
    await progress.remove(BOOK);
    expect(await rows()).toEqual([]);
  });

  it('refuses writes from a tab that still shows an account which signed out', async () => {
    const { db, progress, rows } = await setup('account-a');
    await db.meta.delete(OWNER_KEY);
    await progress.put(place(10));
    expect(await db.progress.count()).toBe(0);
    expect(await rows()).toEqual([]);
  });
});
