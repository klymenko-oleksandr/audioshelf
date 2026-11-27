/**
 * Local playback progress, one record per book (PRD: Player → Position saving).
 * Position is book time in seconds. A signed-in listener's records are synced (Phase 6c); a
 * guest's stay on this device.
 */
export interface ProgressRecord {
  bookId: string;
  /** Book time in seconds. */
  position: number;
  /** Book length when the position was saved (it can grow for ongoing books). */
  duration: number;
  /** Speed is remembered per book. */
  speed: number;
  finished: boolean;
  /** Milliseconds since epoch, device clock. */
  updatedAt: number;
  /**
   * When playback last paused (ms since epoch); absent while playing. Auto-rewind measures
   * the pause from it. `updatedAt` is no use for that: saving while paused (the tab is
   * hidden) moves it.
   */
  pausedAt?: number;
  /**
   * The listener removed this book from Continue listening (ms since epoch). Position and
   * History stay; playing the book again writes a record without it. Only the engine's
   * `dismissProgress` sets it.
   */
  dismissedAt?: number;
  /**
   * Tombstone: the saved place was cleared ("Remove from History"). Kept so the removal can
   * be pushed; `ProgressStore.all()` never returns such a row.
   */
  deletedAt?: number;
}

export interface ProgressStore {
  /** Saved places, without cleared ones. */
  all(): Promise<ProgressRecord[]>;
  put(record: ProgressRecord): Promise<void>;
  /** Forget a book's saved place ("Remove from History"). */
  remove(bookId: string): Promise<void>;
}

/** For tests, and as the fallback when IndexedDB is unavailable (private mode, old browsers). */
export function createMemoryProgressStore(initial: ProgressRecord[] = []): ProgressStore & {
  records: Map<string, ProgressRecord>;
} {
  const records = new Map(initial.map((record) => [record.bookId, record]));
  return {
    records,
    all: async () => [...records.values()],
    put: async (record) => {
      records.set(record.bookId, record);
    },
    remove: async (bookId) => {
      records.delete(bookId);
    },
  };
}
