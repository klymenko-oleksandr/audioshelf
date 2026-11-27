import type { EntityTable } from 'dexie';
import type { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import type { FlagRecord, HistoryRecord } from '@/lib/local-db/types';
import type { FlagKind } from '@/features/sync/merge';
import {
  flagChange,
  historyChange,
  queueChange,
  trackedTables,
} from '@/features/sync/client/outbox';
import { addFlag, isLive, liveFlags, removeFlag, restoreFlag } from './flags';
import { liveHistory, recordFinish, recordStart, removeHistory } from './history';

export interface FlagStore {
  /** Add (no-op if already in). Returns the row. `at` is when the listener did it. */
  add(bookId: string, at?: number): Promise<FlagRecord>;
  /** Remove with a tombstone. `false` when the book was not in. */
  remove(bookId: string): Promise<boolean>;
  /**
   * Undo of a removal: the same row, back in, with the `addedAt` of `previous` and a fresh
   * `updatedAt`. No-op when the book is in already.
   */
  restore(previous: FlagRecord): Promise<FlagRecord>;
  has(bookId: string): Promise<boolean>;
  /** Live rows, most recently added first. */
  list(): Promise<FlagRecord[]>;
  /** Every row including tombstones — what Phase 6 will push. */
  everything(): Promise<FlagRecord[]>;
}

export interface HistoryStore {
  /** A book was started or resumed. `restarted` clears its finished mark. */
  start(bookId: string, options?: { restarted?: boolean }): Promise<HistoryRecord>;
  /** Mark finished (first time wins). `undefined` when the book is not in history. */
  finish(bookId: string): Promise<HistoryRecord | undefined>;
  remove(bookId: string): Promise<boolean>;
  list(): Promise<HistoryRecord[]>;
  everything(): Promise<HistoryRecord[]>;
}

export interface LibraryStore {
  likes: FlagStore;
  listenLater: FlagStore;
  history: HistoryStore;
}

export interface LibraryStoreOptions {
  now?: () => number;
}

/**
 * Typed access to the guest's likes, Listen later and history (ADR 4: local-first). Every
 * write is one read-modify-write in a transaction, stamped with `updatedAt` and this
 * device's id. The pure rules live in `flags.ts` and `history.ts`. Likes and Listen later
 * have a UI since 5b (`features/library/flags`), History arrives in 5c; each change
 * of a signed-in listener is queued for the server in the same transaction (Phase 6c).
 */
export function createLibraryStore(db: LocalDb, options: LibraryStoreOptions = {}): LibraryStore {
  const now = options.now ?? Date.now;

  function flagStore(table: EntityTable<FlagRecord, 'bookId'>, kind: FlagKind): FlagStore {
    /** The row and its outbox entry, together. */
    async function write(record: FlagRecord) {
      await table.put(record);
      await queueChange(db, flagChange(kind, record));
    }
    const tables = trackedTables(db, table);
    return {
      async add(bookId, at) {
        const deviceId = await getDeviceId(db);
        return db.transaction('rw', tables, async () => {
          const existing = await table.get(bookId);
          const added = addFlag(existing, bookId, now(), deviceId);
          // `at` is the moment the listener acted; the write itself is stamped by `now`.
          const next = added !== existing && at !== undefined ? { ...added, addedAt: at } : added;
          if (next !== existing) await write(next);
          return next;
        });
      },
      async remove(bookId) {
        const deviceId = await getDeviceId(db);
        return db.transaction('rw', tables, async () => {
          const tombstone = removeFlag(await table.get(bookId), now(), deviceId);
          if (!tombstone) return false;
          await write(tombstone);
          return true;
        });
      },
      async restore(previous) {
        const deviceId = await getDeviceId(db);
        return db.transaction('rw', tables, async () => {
          const existing = await table.get(previous.bookId);
          const next = restoreFlag(existing, previous, now(), deviceId);
          if (next !== existing) await write(next);
          return next;
        });
      },
      has: async (bookId) => isLive(await table.get(bookId)),
      list: async () => liveFlags(await table.toArray()),
      everything: () => table.toArray(),
    };
  }

  const historyTables = trackedTables(db, db.history);
  async function writeHistory(record: HistoryRecord) {
    await db.history.put(record);
    await queueChange(db, historyChange(record));
  }

  const history: HistoryStore = {
    async start(bookId, startOptions) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', historyTables, async () => {
        const next = recordStart(
          await db.history.get(bookId),
          bookId,
          now(),
          deviceId,
          startOptions,
        );
        await writeHistory(next);
        return next;
      });
    },
    async finish(bookId) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', historyTables, async () => {
        const existing = await db.history.get(bookId);
        const next = recordFinish(existing, now(), deviceId);
        if (next && next !== existing) await writeHistory(next);
        return next;
      });
    },
    async remove(bookId) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', historyTables, async () => {
        const tombstone = removeHistory(await db.history.get(bookId), now(), deviceId);
        if (!tombstone) return false;
        await writeHistory(tombstone);
        return true;
      });
    },
    list: async () => liveHistory(await db.history.toArray()),
    everything: () => db.history.toArray(),
  };

  return {
    likes: flagStore(db.likes, 'like'),
    listenLater: flagStore(db.listenLater, 'listen_later'),
    history,
  };
}
