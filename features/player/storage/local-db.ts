import { LocalDb } from '@/lib/local-db/db';
import { getLocalDb } from '@/lib/local-db/shared';
import { createMemoryProgressStore, type ProgressStore } from './progress-store';

export { LocalDb };

export function createDexieProgressStore(db: LocalDb): ProgressStore {
  return {
    all: () => db.progress.toArray(),
    put: async (record) => {
      await db.progress.put(record);
    },
  };
}

/** IndexedDB when it works, memory otherwise — playback must never depend on storage. */
export function createProgressStore(): ProgressStore {
  if (typeof indexedDB === 'undefined') return createMemoryProgressStore();

  const dexie = createDexieProgressStore(getLocalDb());
  const memory = createMemoryProgressStore();
  let broken = false;
  const fallback = <T>(run: (store: ProgressStore) => Promise<T>) =>
    broken
      ? run(memory)
      : run(dexie).catch((error: unknown) => {
          console.warn('Progress storage is unavailable; keeping progress in memory.', error);
          broken = true;
          return run(memory);
        });

  return {
    all: () => fallback((store) => store.all()),
    put: (record) => fallback((store) => store.put(record)),
  };
}
