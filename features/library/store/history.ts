import type { HistoryRecord } from '@/lib/local-db/types';

/** History: every book the listener started, most recent first (PRD: Library → History). */

const isLiveEntry = (record: HistoryRecord | undefined): record is HistoryRecord =>
  record !== undefined && record.deletedAt === undefined;

/**
 * A book was started or resumed. `restarted` is for "Play again" on a finished book: the
 * finished mark is cleared (PRD: finished stays finished unless the user restarts).
 */
export function recordStart(
  existing: HistoryRecord | undefined,
  bookId: string,
  now: number,
  deviceId: string,
  options: { restarted?: boolean } = {},
): HistoryRecord {
  if (!isLiveEntry(existing)) {
    return { bookId, startedAt: now, lastPlayedAt: now, updatedAt: now, deviceId };
  }
  if (options.restarted) {
    return { bookId, startedAt: now, lastPlayedAt: now, updatedAt: now, deviceId };
  }
  return { ...existing, lastPlayedAt: now, updatedAt: now, deviceId };
}

/** The entry with `finishedAt` set; the first time wins. `undefined` if not in history. */
export function recordFinish(
  existing: HistoryRecord | undefined,
  now: number,
  deviceId: string,
): HistoryRecord | undefined {
  if (!isLiveEntry(existing)) return undefined;
  if (existing.finishedAt !== undefined) return existing;
  return { ...existing, finishedAt: now, updatedAt: now, deviceId };
}

/** The tombstone, or `undefined` when there is nothing live to remove. */
export function removeHistory(
  existing: HistoryRecord | undefined,
  now: number,
  deviceId: string,
): HistoryRecord | undefined {
  if (!isLiveEntry(existing)) return undefined;
  return { ...existing, updatedAt: now, deviceId, deletedAt: now };
}

/** Live entries, most recently played first. */
export function liveHistory(records: readonly HistoryRecord[]): HistoryRecord[] {
  return records
    .filter(isLiveEntry)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || a.bookId.localeCompare(b.bookId));
}
