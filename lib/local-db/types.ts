/**
 * Row shapes of the local-first store (ADR 4). Every row that Phase 6 will sync carries
 * `updatedAt` (ms since epoch, device clock) and `deviceId`; removable rows carry a
 * `deletedAt` tombstone instead of being deleted, so a removal can be told to the server.
 */

/** A like or a Listen later entry. `deletedAt` set = removed (a tombstone). */
export interface FlagRecord {
  bookId: string;
  /** When it was (last) added; Library sorts "recently added" by this. */
  addedAt: number;
  updatedAt: number;
  deviceId: string;
  deletedAt?: number;
}

/** A book the listener started (PRD: Library → History). */
export interface HistoryRecord {
  bookId: string;
  startedAt: number;
  lastPlayedAt: number;
  /** Set once the book was finished; it stays set unless the listener restarts it. */
  finishedAt?: number;
  updatedAt: number;
  deviceId: string;
  deletedAt?: number;
}

/** One explicitly saved setting. Settings left at their default have no row. */
export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: number;
  deviceId: string;
}

/** Device-level facts that are not synced: the device id now, a sync cursor later. */
export interface MetaRecord {
  key: string;
  value: unknown;
}
