import type { FlagItem, HistoryItem, ProgressItem, SettingItem } from '@/features/sync/merge';

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

/**
 * One change waiting to be pushed (Phase 6c). One row per changed thing and account, so the
 * latest state wins. It carries the whole item as it goes on the wire: after a sign-out the
 * account's data leaves this browser's tables, and an unsent change must survive that.
 */
export type OutboxRecord = {
  /** The account the change belongs to. */
  owner: string;
  /** `progress:<book>`, `flag:<book>:<kind>`, `history:<book>` or `setting:<key>`. */
  key: string;
  /** Part of the first sign-in: pushed with `merge: true`. */
  merge: boolean;
  /** New on every write, so a 200 only removes what was really sent. */
  version: string;
} & (
  | { kind: 'progress'; item: ProgressItem }
  | { kind: 'flag'; item: FlagItem }
  | { kind: 'history'; item: HistoryItem }
  | { kind: 'setting'; item: SettingItem }
);

/** Device-level facts that are not synced: the device id, and the sync owner and cursors. */
export interface MetaRecord {
  key: string;
  value: unknown;
}
