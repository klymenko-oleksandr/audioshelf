/**
 * The two requests as the browser sends them (shapes: `features/sync/request.ts` and
 * `handlers.ts`).
 */
import type { OutboxRecord } from '@/lib/local-db/types';
import type { Batch } from '../merge';
import { MAX_DEVICE_NAME, MAX_ITEMS_PER_LIST } from '../request';

export interface PushBody {
  deviceId: string;
  deviceName: string;
  clientNow: number;
  merge?: boolean;
  changes: Batch;
}

export interface PushBatch {
  merge: boolean;
  entries: OutboxRecord[];
  changes: Batch;
}

const LISTS = {
  progress: 'progress',
  flag: 'flags',
  history: 'history',
  setting: 'settings',
} as const;

const emptyBatch = (): Batch => ({ progress: [], flags: [], history: [], settings: [] });

export interface BatchLimits {
  perList?: number;
  /** Room for the items of one batch, in bytes of JSON. */
  bytes?: number;
}

const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * Outbox rows as requests: merge rows apart from ordinary ones (the flag is per request), at
 * most `perList` items per list and about `bytes` of items per request. Merge batches go first.
 */
export function toBatches(entries: readonly OutboxRecord[], limits: BatchLimits = {}): PushBatch[] {
  const perList = limits.perList ?? MAX_ITEMS_PER_LIST;
  const maxBytes = limits.bytes ?? 900_000;
  const batches: PushBatch[] = [];
  for (const merge of [true, false]) {
    let batch: PushBatch | undefined;
    let used = 0;
    for (const entry of entries) {
      if (entry.merge !== merge) continue;
      const list = LISTS[entry.kind];
      const bytes = size(entry.item) + 1;
      if (!batch || batch.changes[list].length >= perList || used + bytes > maxBytes) {
        batch = { merge, entries: [], changes: emptyBatch() };
        batches.push(batch);
        used = 0;
      }
      batch.entries.push(entry);
      (batch.changes[list] as unknown[]).push(entry.item);
      used += bytes;
    }
  }
  return batches;
}

/** "Chrome on macOS": what the other devices will call this one. */
export function deviceName(userAgent: string): string {
  const first = (table: [RegExp, string][]) => table.find(([re]) => re.test(userAgent))?.[1];
  const browser = first([
    [/Edg(e|A|iOS)?\//, 'Edge'],
    [/OPR\/|Opera/, 'Opera'],
    [/SamsungBrowser\//, 'Samsung Internet'],
    [/Firefox\/|FxiOS\//, 'Firefox'],
    [/Chrome\/|CriOS\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ]);
  const system = first([
    [/iPhone/, 'iPhone'],
    [/iPad/, 'iPad'],
    [/Android/, 'Android'],
    [/Windows/, 'Windows'],
    [/Mac OS X|Macintosh/, 'macOS'],
    [/CrOS/, 'ChromeOS'],
    [/Linux/, 'Linux'],
  ]);
  const name = browser && system ? `${browser} on ${system}` : (browser ?? system ?? 'Web browser');
  return name.slice(0, MAX_DEVICE_NAME);
}
