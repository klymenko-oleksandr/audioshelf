/**
 * The outbox (Phase 6c). A change and its outbox row are written in one Dexie transaction, so
 * there is never one without the other. A guest has no outbox rows: the first sign-in pushes
 * everything on the device instead (`identity.ts`).
 */
import Dexie, { type Table } from 'dexie';
import { normalizeSpeed } from '@/features/player/core/rules';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import type { LocalDb } from '@/lib/local-db/db';
import type { FlagRecord, HistoryRecord, OutboxRecord, SettingRecord } from '@/lib/local-db/types';
import { validateSetting, type FlagKind } from '../merge';
import { MAX_SECONDS } from '../request';

/** `meta` row: the account whose data is in the tables. Absent for a guest. */
export const OWNER_KEY = 'syncOwner';

/**
 * The server rejects a whole batch with one bad id, so ids it cannot take never get in. Old
 * Phase 2 positions and the built-in test book have such ids.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What an outbox row holds, before it has an owner. */
export type Change = OutboxRecord extends infer R
  ? R extends OutboxRecord
    ? Pick<R, 'key' | 'kind' | 'item'>
    : never
  : never;

const whole = (time: number) => Math.max(0, Math.round(time));
const wholeOrNull = (time: number | undefined) => (time === undefined ? null : whole(time));
const seconds = (value: number) =>
  Number.isFinite(value) ? Math.min(MAX_SECONDS, Math.max(0, value)) : 0;

export const progressKey = (bookId: string) => `progress:${bookId}`;
export const flagOutboxKey = (bookId: string, kind: FlagKind) => `flag:${bookId}:${kind}`;
export const historyOutboxKey = (bookId: string) => `history:${bookId}`;
export const settingOutboxKey = (key: string) => `setting:${key}`;

export function progressChange(record: ProgressRecord): Change | null {
  if (!UUID.test(record.bookId)) return null;
  return {
    key: progressKey(record.bookId),
    kind: 'progress',
    item: {
      bookId: record.bookId,
      position: seconds(record.position),
      duration: seconds(record.duration),
      speed: normalizeSpeed(record.speed),
      finished: record.finished,
      dismissedAt: wholeOrNull(record.dismissedAt),
      deletedAt: wholeOrNull(record.deletedAt),
      updatedAt: whole(record.updatedAt),
    },
  };
}

export function flagChange(kind: FlagKind, record: FlagRecord): Change | null {
  if (!UUID.test(record.bookId)) return null;
  return {
    key: flagOutboxKey(record.bookId, kind),
    kind: 'flag',
    item: {
      bookId: record.bookId,
      kind,
      addedAt: whole(record.addedAt),
      deletedAt: wholeOrNull(record.deletedAt),
      updatedAt: whole(record.updatedAt),
    },
  };
}

export function historyChange(record: HistoryRecord): Change | null {
  if (!UUID.test(record.bookId)) return null;
  return {
    key: historyOutboxKey(record.bookId),
    kind: 'history',
    item: {
      bookId: record.bookId,
      startedAt: whole(record.startedAt),
      lastPlayedAt: whole(record.lastPlayedAt),
      finishedAt: wholeOrNull(record.finishedAt),
      deletedAt: wholeOrNull(record.deletedAt),
      updatedAt: whole(record.updatedAt),
    },
  };
}

export function settingChange(record: SettingRecord): Change | null {
  if (!validateSetting(record.key, record.value).ok) return null;
  return {
    key: settingOutboxKey(record.key),
    kind: 'setting',
    item: { key: record.key, value: record.value, updatedAt: whole(record.updatedAt) },
  };
}

export async function readOwner(db: LocalDb): Promise<string | null> {
  const row = await db.meta.get(OWNER_KEY);
  return typeof row?.value === 'string' ? row.value : null;
}

const isRemoval = (change: Change) => change.kind !== 'setting' && Boolean(change.item.deletedAt);

export function outboxRow(owner: string, change: Change, merge: boolean): OutboxRecord {
  return { ...change, owner, merge, version: crypto.randomUUID() } as OutboxRecord;
}

type Listener = (kind: OutboxRecord['kind']) => void;
const listeners = new WeakMap<LocalDb, Set<Listener>>();

/** Told after a queued change has been committed. */
export function onQueued(db: LocalDb, listener: Listener): () => void {
  const set = listeners.get(db) ?? new Set<Listener>();
  listeners.set(db, set);
  set.add(listener);
  return () => set.delete(listener);
}

/**
 * Queue a change. Call it inside the transaction that makes the change, which must include
 * `meta` and `outbox` (`trackedTables`). The latest state of a row replaces the waiting one.
 * A row still waiting for the first-sign-in merge stays a merge row, so a position played
 * before it was delivered cannot beat a further one on the account; a removal is deliberate
 * and is pushed as an ordinary write (in merge mode a live row would beat it).
 */
export async function queueChange(db: LocalDb, change: Change | null): Promise<void> {
  if (!change) return;
  const owner = await readOwner(db);
  if (!owner) return;
  const waiting = await db.outbox.get([owner, change.key]);
  const merge = (waiting?.merge ?? false) && !isRemoval(change);
  await db.outbox.put(outboxRow(owner, change, merge));
  Dexie.currentTransaction?.on('complete', () => {
    for (const listener of listeners.get(db) ?? []) listener(change.kind);
  });
}

/** The tables of a transaction that changes `tables` and may queue the change. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trackedTables = (db: LocalDb, ...tables: Table<any, any, any>[]) => [
  ...tables,
  db.meta,
  db.outbox,
];
