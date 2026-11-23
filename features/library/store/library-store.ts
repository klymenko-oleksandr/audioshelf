import type { EntityTable } from 'dexie';
import type { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import type { FlagRecord, HistoryRecord } from '@/lib/local-db/types';
import { addFlag, isLive, liveFlags, removeFlag } from './flags';
import { liveHistory, recordFinish, recordStart, removeHistory } from './history';

export interface FlagStore {
  /** Add (no-op if already in). Returns the row. */
  add(bookId: string): Promise<FlagRecord>;
  /** Remove with a tombstone. `false` when the book was not in. */
  remove(bookId: string): Promise<boolean>;
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
 * device's id. The pure rules live in `flags.ts` and `history.ts`. The UI arrives in 5b–5c;
 * writing to the server is Phase 6 (no outbox yet).
 */
export function createLibraryStore(db: LocalDb, options: LibraryStoreOptions = {}): LibraryStore {
  const now = options.now ?? Date.now;

  function flagStore(table: EntityTable<FlagRecord, 'bookId'>): FlagStore {
    return {
      async add(bookId) {
        const deviceId = await getDeviceId(db);
        return db.transaction('rw', table, async () => {
          const existing = await table.get(bookId);
          const next = addFlag(existing, bookId, now(), deviceId);
          if (next !== existing) await table.put(next);
          return next;
        });
      },
      async remove(bookId) {
        const deviceId = await getDeviceId(db);
        return db.transaction('rw', table, async () => {
          const tombstone = removeFlag(await table.get(bookId), now(), deviceId);
          if (!tombstone) return false;
          await table.put(tombstone);
          return true;
        });
      },
      has: async (bookId) => isLive(await table.get(bookId)),
      list: async () => liveFlags(await table.toArray()),
      everything: () => table.toArray(),
    };
  }

  const history: HistoryStore = {
    async start(bookId, startOptions) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', db.history, async () => {
        const next = recordStart(
          await db.history.get(bookId),
          bookId,
          now(),
          deviceId,
          startOptions,
        );
        await db.history.put(next);
        return next;
      });
    },
    async finish(bookId) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', db.history, async () => {
        const existing = await db.history.get(bookId);
        const next = recordFinish(existing, now(), deviceId);
        if (next && next !== existing) await db.history.put(next);
        return next;
      });
    },
    async remove(bookId) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', db.history, async () => {
        const tombstone = removeHistory(await db.history.get(bookId), now(), deviceId);
        if (!tombstone) return false;
        await db.history.put(tombstone);
        return true;
      });
    },
    list: async () => liveHistory(await db.history.toArray()),
    everything: () => db.history.toArray(),
  };

  return { likes: flagStore(db.likes), listenLater: flagStore(db.listenLater), history };
}
