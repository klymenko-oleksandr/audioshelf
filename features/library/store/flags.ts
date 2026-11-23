import type { FlagRecord } from '@/lib/local-db/types';

/**
 * Likes and Listen later are the same kind of record: a book is in or out, and both
 * changes are timestamped (PRD: Progress sync → per-item latest write wins). Removing keeps
 * a tombstone (`deletedAt`) so Phase 6 can tell the server about the removal.
 */

export const isLive = (record: FlagRecord | undefined): record is FlagRecord =>
  record !== undefined && record.deletedAt === undefined;

/** The record after adding. Adding something already live changes nothing (same object). */
export function addFlag(
  existing: FlagRecord | undefined,
  bookId: string,
  now: number,
  deviceId: string,
): FlagRecord {
  if (isLive(existing)) return existing;
  return { bookId, addedAt: now, updatedAt: now, deviceId };
}

/** The tombstone after removing, or `undefined` when there is nothing live to remove. */
export function removeFlag(
  existing: FlagRecord | undefined,
  now: number,
  deviceId: string,
): FlagRecord | undefined {
  if (!isLive(existing)) return undefined;
  return { ...existing, updatedAt: now, deviceId, deletedAt: now };
}

/**
 * The record after Undo of a removal: the book is in again with its original `addedAt` (so it
 * keeps its place in "recently added"), stamped as a new write so it wins over the tombstone
 * it undoes. Same row as before, never a new one. A row that is already live is returned as
 * it is (nothing to undo).
 */
export function restoreFlag(
  existing: FlagRecord | undefined,
  previous: FlagRecord,
  now: number,
  deviceId: string,
): FlagRecord {
  if (isLive(existing)) return existing;
  return { bookId: previous.bookId, addedAt: previous.addedAt, updatedAt: now, deviceId };
}

/** Live records, most recently added first (ties by book id, so the order is stable). */
export function liveFlags(records: readonly FlagRecord[]): FlagRecord[] {
  return records
    .filter(isLive)
    .sort((a, b) => b.addedAt - a.addedAt || a.bookId.localeCompare(b.bookId));
}
