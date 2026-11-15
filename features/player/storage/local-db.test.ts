// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDexieProgressStore, LocalDb } from './local-db';
import { createMemoryProgressStore, type ProgressRecord } from './progress-store';

const record = (bookId: string, position: number, updatedAt = 1000): ProgressRecord => ({
  bookId,
  position,
  duration: 3600,
  speed: 1,
  finished: false,
  updatedAt,
});

describe.each([
  ['Dexie (IndexedDB)', () => createDexieProgressStore(new LocalDb(`test-${Math.random()}`))],
  ['memory', () => createMemoryProgressStore()],
])('progress store — %s', (_name, create) => {
  it('starts empty', async () => {
    expect(await create().all()).toEqual([]);
  });

  it('keeps one record per book and overwrites it', async () => {
    const store = create();
    await store.put(record('siddhartha', 10));
    await store.put(record('animal-farm', 20));
    await store.put(record('siddhartha', 99, 2000));

    const all = await store.all();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.bookId === 'siddhartha')).toEqual(record('siddhartha', 99, 2000));
  });
});

describe('LocalDb', () => {
  it('survives reopening the database', async () => {
    const name = `test-${Math.random()}`;
    const first = new LocalDb(name);
    await createDexieProgressStore(first).put(record('siddhartha', 1234.5));
    first.close();

    const second = createDexieProgressStore(new LocalDb(name));
    expect(await second.all()).toEqual([record('siddhartha', 1234.5)]);
  });
});
