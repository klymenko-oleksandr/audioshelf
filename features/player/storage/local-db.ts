import { LocalDb } from '@/lib/local-db/db';
import { getLocalDb } from '@/lib/local-db/shared';
import {
  createMemoryProgressStore,
  type ProgressRecord,
  type ProgressStore,
} from './progress-store';
import {
  progressChange,
  queueChange,
  readOwner,
  trackedTables,
} from '@/features/sync/client/outbox';

export { LocalDb };

export interface ProgressStoreOptions {
  now?: () => number;
  /** The account this tab is showing (`null`: a guest). */
  tabOwner?: () => string | null;
}

export function createDexieProgressStore(
  db: LocalDb,
  options: ProgressStoreOptions = {},
): ProgressStore {
  const now = options.now ?? Date.now;
  const tables = trackedTables(db, db.progress);

  /**
   * A tab that still shows an account which has since signed out (in another tab) must not
   * write that account's book into the next listener's tables.
   */
  const stale = async () => {
    const shown = options.tabOwner?.() ?? null;
    return shown !== null && (await readOwner(db)) !== shown;
  };

  const write = async (record: ProgressRecord) => {
    await db.progress.put(record);
    await queueChange(db, progressChange(record));
  };

  return {
    all: async () => (await db.progress.toArray()).filter((r) => r.deletedAt === undefined),
    put: (record) =>
      db.transaction('rw', tables, async () => {
        if (!(await stale())) await write(record);
      }),
    remove: (bookId) =>
      db.transaction('rw', tables, async () => {
        const record = await db.progress.get(bookId);
        if (!record || record.deletedAt !== undefined || (await stale())) return;
        const at = now();
        await write({ ...record, updatedAt: at, deletedAt: at });
      }),
  };
}

/** IndexedDB when it works, memory otherwise — playback must never depend on storage. */
export function createProgressStore(options: ProgressStoreOptions = {}): ProgressStore {
  if (typeof indexedDB === 'undefined') return createMemoryProgressStore();

  const dexie = createDexieProgressStore(getLocalDb(), options);
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
    remove: (bookId) => fallback((store) => store.remove(bookId)),
  };
}
