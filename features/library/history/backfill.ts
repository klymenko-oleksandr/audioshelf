import type { HistoryRecord } from '@/lib/local-db/types';

interface SavedPlace {
  bookId: string;
  position: number;
  finished: boolean;
  updatedAt: number;
}

/**
 * History starts in Phase 5c, but listeners already have saved places from earlier phases.
 * Without this their Library → History would be empty although they have listened for hours.
 * Each saved place without an entry (not even a removed one) becomes one, dated by its last
 * save: the real start time is not known. A place with no progress that is not finished was
 * never really started and is skipped.
 */
export function planBackfill(
  saved: readonly SavedPlace[],
  existing: readonly Pick<HistoryRecord, 'bookId'>[],
  deviceId: string,
): HistoryRecord[] {
  const known = new Set(existing.map((entry) => entry.bookId));
  const rows: HistoryRecord[] = [];
  for (const place of saved) {
    if (known.has(place.bookId)) continue;
    if (!(place.position > 0) && !place.finished) continue;
    rows.push({
      bookId: place.bookId,
      startedAt: place.updatedAt,
      lastPlayedAt: place.updatedAt,
      ...(place.finished ? { finishedAt: place.updatedAt } : {}),
      updatedAt: place.updatedAt,
      deviceId,
    });
  }
  return rows;
}
