import type { SettingsChannel } from '@/features/settings/channel';
import type { LocalDb } from '@/lib/local-db/db';
import type { FlagRecord } from '@/lib/local-db/types';
import { createLibraryStore, type LibraryStoreOptions } from '../store/library-store';

/** The two flags a listener can put on a book. They are independent of each other. */
export type FlagKind = 'like' | 'listenLater';

export interface FlagsSnapshot {
  /** True once storage has been read (or has failed), so the sets can be trusted. */
  ready: boolean;
  liked: ReadonlySet<string>;
  listenLater: ReadonlySet<string>;
  /** When each liked / queued book was added (Library sorts "recently added" by it). */
  likedAt: ReadonlyMap<string, number>;
  listenLaterAt: ReadonlyMap<string, number>;
}

export interface ToggleResult {
  kind: FlagKind;
  bookId: string;
  /** The state the book is in after the toggle. */
  on: boolean;
  /**
   * Undo this toggle: an add becomes a tombstone, a removal is restored to the same row with
   * its original `addedAt`. Does nothing (`false`) when the book has changed since, or when
   * it was undone already.
   */
  undo(): Promise<boolean>;
}

/** Where the flags live. Dexie in the app, a fake in tests. */
export interface FlagsRepo {
  /** Live rows only. */
  load(): Promise<Record<FlagKind, FlagRecord[]>>;
  add(kind: FlagKind, bookId: string, at?: number): Promise<FlagRecord>;
  remove(kind: FlagKind, bookId: string): Promise<boolean>;
  restore(kind: FlagKind, previous: FlagRecord): Promise<FlagRecord>;
}

export function createDexieFlagsRepo(db: LocalDb, options: LibraryStoreOptions = {}): FlagsRepo {
  const library = createLibraryStore(db, options);
  const flags = (kind: FlagKind) => (kind === 'like' ? library.likes : library.listenLater);
  return {
    async load() {
      const [like, listenLater] = await Promise.all([
        library.likes.list(),
        library.listenLater.list(),
      ]);
      return { like, listenLater };
    },
    add: (kind, bookId, at) => flags(kind).add(bookId, at),
    remove: (kind, bookId) => flags(kind).remove(bookId),
    restore: (kind, previous) => flags(kind).restore(previous),
  };
}

export interface FlagsStoreOptions {
  repo: FlagsRepo;
  /** Tells other tabs about a change, and tells this one about theirs. */
  channel?: SettingsChannel;
  /**
   * Called once for every add made by the listener (a like or Listen later turned on). Not
   * called for a removal, for Undo (an Undo of a removal puts the old row back, which is not a
   * new add) or when a finished book leaves Listen later. Feeds the guest nudge counter.
   */
  onAdd?: (kind: FlagKind, bookId: string) => void;
}

/** A change made here that storage may not have confirmed yet. */
interface Pending {
  value: boolean;
  /** When the book was added, while it is still unsaved (an Undo keeps the original time). */
  addedAt?: number;
  /** Writes for this book that have not finished. */
  inFlight: number;
  /** The last write failed: the value holds for this session only. */
  failed: boolean;
}

const KINDS: readonly FlagKind[] = ['like', 'listenLater'];
const keyOf = (kind: FlagKind, bookId: string) => `${kind}:${bookId}`;

function sameMap(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

/**
 * The guest's likes and Listen later, in memory and in Dexie. Framework-free; React reads it
 * through `subscribe` / `getSnapshot` (`useLibraryFlags`). Same approach as `SettingsStore`:
 *
 * - A toggle shows at once; the write goes to Dexie behind it, one at a time and in order.
 *   If storage fails the value still holds for the session.
 * - After a write, a ping tells the other tabs, which re-read Dexie.
 * - A change that is still being saved wins over a read, so a stale read from another tab
 *   cannot flip a heart back.
 * - The snapshot keeps its identity until a set really changes (`useSyncExternalStore`).
 * - Only book ids are held. Books that were unpublished or deleted later stay in the sets and
 *   break nothing; whoever lists them (the Library page, 5c) skips ids it cannot resolve.
 */
export class LibraryFlagsStore {
  private snapshot: FlagsSnapshot = {
    ready: false,
    liked: new Set(),
    listenLater: new Set(),
    likedAt: new Map(),
    listenLaterAt: new Map(),
  };
  private loaded = false;
  private firstLoad: Promise<void> | null = null;
  /** What storage holds: the live rows. */
  private stored: Record<FlagKind, Map<string, FlagRecord>> = {
    like: new Map(),
    listenLater: new Map(),
  };
  private readonly pending = new Map<string, Pending>();
  /** Writes run one after another, in the order they were made. */
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly stopListening: (() => void) | undefined;

  constructor(private readonly options: FlagsStoreOptions) {
    this.stopListening = options.channel?.subscribe(() => void this.load());
  }

  getSnapshot = (): FlagsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read storage. A failure leaves the current values in place. */
  async load(): Promise<void> {
    try {
      const rows = await this.options.repo.load();
      for (const kind of KINDS) {
        this.stored[kind] = new Map(rows[kind].map((row) => [row.bookId, row]));
      }
    } catch (error) {
      console.warn('Likes and Listen later storage is unavailable; keeping them in memory.', error);
    }
    this.loaded = true;
    this.rebuild();
  }

  /**
   * Flip one flag. The new state shows at once; the promise settles when the write has
   * finished (or failed, in which case the value still holds for this session).
   */
  async toggle(kind: FlagKind, bookId: string): Promise<ToggleResult> {
    if (!this.loaded) await this.whenReady();

    const wasOn = this.isOn(kind, bookId);
    // What a removal would tombstone: Undo puts exactly this back.
    const previous = this.stored[kind].get(bookId);
    await this.apply(kind, bookId, !wasOn);
    // After the like is saved, so the counter's own write never competes with it.
    if (!wasOn) this.countAdd(kind, bookId);

    let undone = false;
    return {
      kind,
      bookId,
      on: !wasOn,
      undo: async () => {
        if (undone || this.isOn(kind, bookId) !== !wasOn) return false;
        undone = true;
        await this.apply(kind, bookId, wasOn, wasOn ? previous : undefined);
        return true;
      },
    };
  }

  /**
   * Take a book out of a list without a toast (a finished book leaves Listen later, PRD).
   * `false` when it was not in. Shows at once, is saved and reaches the other tabs.
   */
  async remove(kind: FlagKind, bookId: string): Promise<boolean> {
    if (!this.loaded) await this.whenReady();
    if (!this.isOn(kind, bookId)) return false;
    await this.apply(kind, bookId, false);
    return true;
  }

  dispose(): void {
    this.stopListening?.();
    this.options.channel?.close();
    this.listeners.clear();
  }

  /** A broken counter must never break a like. */
  private countAdd(kind: FlagKind, bookId: string): void {
    try {
      this.options.onAdd?.(kind, bookId);
    } catch (error) {
      console.warn('Could not count the add.', error);
    }
  }

  private whenReady(): Promise<void> {
    this.firstLoad ??= this.load();
    return this.firstLoad;
  }

  private isOn(kind: FlagKind, bookId: string): boolean {
    return this.pending.get(keyOf(kind, bookId))?.value ?? this.stored[kind].has(bookId);
  }

  /** Show the new state now, then write it. `restoreFrom` puts a removed row back. */
  private apply(
    kind: FlagKind,
    bookId: string,
    on: boolean,
    restoreFrom?: FlagRecord,
  ): Promise<void> {
    const key = keyOf(kind, bookId);
    const entry = this.pending.get(key) ?? { value: on, inFlight: 0, failed: false };
    entry.value = on;
    entry.addedAt = on ? (restoreFrom?.addedAt ?? Date.now()) : undefined;
    entry.failed = false;
    entry.inFlight += 1;
    this.pending.set(key, entry);
    this.rebuild();

    const addedAt = entry.addedAt;
    const write = this.queue.then(() => this.persist(kind, bookId, on, restoreFrom, addedAt));
    this.queue = write;
    return write;
  }

  /** Never rejects: a failed save is logged and the value stays for the session. */
  private async persist(
    kind: FlagKind,
    bookId: string,
    on: boolean,
    restoreFrom?: FlagRecord,
    addedAt?: number,
  ): Promise<void> {
    const key = keyOf(kind, bookId);
    const { repo, channel } = this.options;
    let saved = true;
    try {
      if (on) {
        const row = restoreFrom
          ? await repo.restore(kind, restoreFrom)
          : await repo.add(kind, bookId, addedAt);
        this.stored[kind].set(bookId, row);
      } else {
        await repo.remove(kind, bookId);
        this.stored[kind].delete(bookId);
      }
    } catch (error) {
      saved = false;
      console.warn('Could not save the change.', error);
    }

    const entry = this.pending.get(key);
    if (entry) {
      entry.inFlight -= 1;
      if (!saved) entry.failed = true;
      // Keep the value while more writes for this book are queued, or when saving failed.
      if (entry.inFlight === 0 && !entry.failed) this.pending.delete(key);
    }
    this.rebuild();
    if (saved) channel?.post();
  }

  /** Stored rows with the unsaved changes laid over them. Notifies only on a real change. */
  private rebuild(): void {
    const added: Record<FlagKind, Map<string, number>> = {
      like: new Map([...this.stored.like].map(([id, row]) => [id, row.addedAt])),
      listenLater: new Map([...this.stored.listenLater].map(([id, row]) => [id, row.addedAt])),
    };
    for (const [key, entry] of this.pending) {
      const separator = key.indexOf(':');
      const kind = key.slice(0, separator) as FlagKind;
      const bookId = key.slice(separator + 1);
      if (entry.value) {
        // A book already stored keeps its time; an unsaved add gets the time it was made.
        if (!added[kind].has(bookId) || entry.addedAt !== undefined) {
          added[kind].set(bookId, entry.addedAt ?? Date.now());
        }
      } else added[kind].delete(bookId);
    }

    const current = this.snapshot;
    if (
      current.ready === this.loaded &&
      sameMap(current.likedAt, added.like) &&
      sameMap(current.listenLaterAt, added.listenLater)
    ) {
      return;
    }
    this.snapshot = {
      ready: this.loaded,
      liked: new Set(added.like.keys()),
      listenLater: new Set(added.listenLater.keys()),
      likedAt: added.like,
      listenLaterAt: added.listenLater,
    };
    for (const listener of this.listeners) listener();
  }
}
