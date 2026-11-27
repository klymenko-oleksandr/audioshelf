import type { SettingsChannel } from '@/features/settings/channel';
import { historyChange, queueChange, trackedTables } from '@/features/sync/client/outbox';
import type { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import type { HistoryRecord } from '@/lib/local-db/types';
import { liveHistory, recordFinish, recordStart, removeHistory } from '../store/history';
import { createLibraryStore, type LibraryStoreOptions } from '../store/library-store';
import { planBackfill } from './backfill';

/** A saved place, as far as the backfill needs it. */
export interface SavedPlace {
  bookId: string;
  position: number;
  finished: boolean;
  updatedAt: number;
}

export interface HistoryRepo {
  /** Live entries. */
  load(): Promise<HistoryRecord[]>;
  start(bookId: string, restarted: boolean): Promise<HistoryRecord>;
  finish(bookId: string): Promise<HistoryRecord | undefined>;
  remove(bookId: string): Promise<boolean>;
  /** One-time: entries for places saved before History existed. Returns how many were made. */
  backfill(places: readonly SavedPlace[]): Promise<number>;
}

export const BACKFILL_KEY = 'historyBackfilledAt';

export function createDexieHistoryRepo(
  db: LocalDb,
  options: LibraryStoreOptions = {},
): HistoryRepo {
  const history = createLibraryStore(db, options).history;
  const now = options.now ?? Date.now;
  return {
    load: () => history.list(),
    start: (bookId, restarted) => history.start(bookId, { restarted }),
    finish: (bookId) => history.finish(bookId),
    remove: (bookId) => history.remove(bookId),
    async backfill(places) {
      const deviceId = await getDeviceId(db);
      return db.transaction('rw', trackedTables(db, db.history), async () => {
        if (await db.meta.get(BACKFILL_KEY)) return 0;
        const rows = planBackfill(places, await db.history.toArray(), deviceId);
        if (rows.length > 0) await db.history.bulkPut(rows);
        for (const row of rows) await queueChange(db, historyChange(row));
        await db.meta.put({ key: BACKFILL_KEY, value: now() });
        return rows.length;
      });
    },
  };
}

export interface HistorySnapshot {
  /** True once storage has been read (or has failed). */
  ready: boolean;
  /** Live entries, most recently played first. */
  entries: readonly HistoryRecord[];
}

export interface HistoryStoreOptions {
  repo: HistoryRepo;
  /** Tells other tabs about a change, and tells this one about theirs. */
  channel?: SettingsChannel;
}

/** A change made here that storage may not have confirmed yet. `null` = removed. */
interface Pending {
  record: HistoryRecord | null;
  inFlight: number;
  failed: boolean;
}

function sameEntries(a: readonly HistoryRecord[], b: readonly HistoryRecord[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return (
      x.bookId === y.bookId &&
      x.startedAt === y.startedAt &&
      x.lastPlayedAt === y.lastPlayedAt &&
      x.finishedAt === y.finishedAt
    );
  });
}

/**
 * The listener's History, in memory and in Dexie. Same approach as `LibraryFlagsStore`: a
 * change shows at once, the write goes behind it one at a time, other tabs are pinged and
 * re-read, and a change that is still being saved wins over a read.
 */
export class LibraryHistoryStore {
  private snapshot: HistorySnapshot = { ready: false, entries: [] };
  private loaded = false;
  private firstLoad: Promise<void> | null = null;
  private stored = new Map<string, HistoryRecord>();
  private readonly pending = new Map<string, Pending>();
  /** Writes and reads run one after another, so a read cannot overtake a write. */
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly stopListening: (() => void) | undefined;

  constructor(private readonly options: HistoryStoreOptions) {
    this.stopListening = options.channel?.subscribe(() => void this.load());
  }

  getSnapshot = (): HistorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read storage. A failure leaves the current entries in place. */
  load(): Promise<void> {
    const run = this.queue.then(async () => {
      try {
        const rows = await this.options.repo.load();
        this.stored = new Map(rows.map((row) => [row.bookId, row]));
      } catch (error) {
        console.warn('History storage is unavailable; keeping it in memory.', error);
      }
      this.loaded = true;
      this.rebuild();
    });
    this.queue = run;
    return run;
  }

  /** A book started or resumed playing. `restarted`: a finished book played again. */
  async recordPlay(bookId: string, restarted: boolean): Promise<void> {
    if (!this.loaded) await this.whenReady();
    const next = recordStart(this.visible(bookId), bookId, Date.now(), '', { restarted });
    await this.apply(bookId, next, (repo) => repo.start(bookId, restarted));
  }

  /** The book reached its end. Nothing happens for a book that is not in History. */
  async recordFinish(bookId: string): Promise<void> {
    if (!this.loaded) await this.whenReady();
    const next = recordFinish(this.visible(bookId), Date.now(), '');
    if (!next) return;
    await this.apply(bookId, next, (repo) => repo.finish(bookId));
  }

  /** Remove an entry. `false` when it was not in History. */
  async remove(bookId: string): Promise<boolean> {
    if (!this.loaded) await this.whenReady();
    if (!removeHistory(this.visible(bookId), Date.now(), '')) return false;
    await this.apply(bookId, null, (repo) => repo.remove(bookId));
    return true;
  }

  /** One-time migration of places saved before History existed. */
  async backfill(places: readonly SavedPlace[]): Promise<void> {
    if (!this.loaded) await this.whenReady();
    const run = this.queue.then(async () => {
      let added = 0;
      try {
        added = await this.options.repo.backfill(places);
        if (added > 0) {
          const rows = await this.options.repo.load();
          this.stored = new Map(rows.map((row) => [row.bookId, row]));
        }
      } catch (error) {
        console.warn('Could not fill History from saved places.', error);
      }
      this.rebuild();
      if (added > 0) this.options.channel?.post();
    });
    this.queue = run;
    await run;
  }

  dispose(): void {
    this.stopListening?.();
    this.options.channel?.close();
    this.listeners.clear();
  }

  private whenReady(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    this.firstLoad ??= this.load();
    return this.firstLoad;
  }

  private visible(bookId: string): HistoryRecord | undefined {
    const pending = this.pending.get(bookId);
    return pending ? (pending.record ?? undefined) : this.stored.get(bookId);
  }

  private apply(
    bookId: string,
    record: HistoryRecord | null,
    write: (repo: HistoryRepo) => Promise<HistoryRecord | boolean | undefined>,
  ): Promise<void> {
    const entry = this.pending.get(bookId) ?? { record, inFlight: 0, failed: false };
    entry.record = record;
    entry.failed = false;
    entry.inFlight += 1;
    this.pending.set(bookId, entry);
    this.rebuild();

    const run = this.queue.then(async () => {
      let saved = true;
      try {
        const result = await write(this.options.repo);
        if (record === null) this.stored.delete(bookId);
        else if (result && typeof result === 'object') this.stored.set(bookId, result);
      } catch (error) {
        saved = false;
        console.warn('Could not save History.', error);
      }
      const current = this.pending.get(bookId);
      if (current) {
        current.inFlight -= 1;
        if (!saved) current.failed = true;
        if (current.inFlight === 0 && !current.failed) this.pending.delete(bookId);
      }
      this.rebuild();
      if (saved) this.options.channel?.post();
    });
    this.queue = run;
    return run;
  }

  /** Stored entries with the unsaved changes laid over them. Notifies only on a change. */
  private rebuild(): void {
    const merged = new Map(this.stored);
    for (const [bookId, entry] of this.pending) {
      if (entry.record) merged.set(bookId, entry.record);
      else merged.delete(bookId);
    }
    const entries = liveHistory([...merged.values()]);
    if (this.snapshot.ready === this.loaded && sameEntries(this.snapshot.entries, entries)) return;
    this.snapshot = { ready: this.loaded, entries };
    for (const listener of this.listeners) listener();
  }
}
