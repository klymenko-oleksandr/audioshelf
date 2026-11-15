import Dexie, { type EntityTable } from 'dexie';
import {
  createMemoryProgressStore,
  type ProgressRecord,
  type ProgressStore,
} from './progress-store';

/**
 * The app's IndexedDB database (ADR 4: local-first store). Phase 2 needs only progress;
 * likes, Listen later, history, settings and the sync outbox join in Phases 5 and 6 as
 * further tables and schema versions.
 */
export class LocalDb extends Dexie {
  progress!: EntityTable<ProgressRecord, 'bookId'>;

  constructor(name = 'audioshelf') {
    super(name);
    this.version(1).stores({
      progress: 'bookId, updatedAt',
    });
  }
}

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

  const dexie = createDexieProgressStore(new LocalDb());
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
