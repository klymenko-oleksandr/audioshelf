/**
 * A pulled page into the local tables (Phase 6c), with the server's own merge rules
 * (`merge.ts`), so a newer change made here is never overwritten.
 *
 * The first pull after a sign-in is different. It runs only after the merge push, so the server
 * already holds the result of everything this device had, including results that latest-write
 * wins would not give (the furthest position can be the older one). There the server's row
 * replaces the local one, unless it changed here since the page was asked for.
 */
import { normalizeSpeed } from '@/features/player/core/rules';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import type { LocalDb } from '@/lib/local-db/db';
import type { FlagRecord, HistoryRecord, SettingRecord } from '@/lib/local-db/types';
import {
  mergeFlag,
  mergeHistory,
  mergeProgress,
  mergeSetting,
  validateSetting,
  type FlagState,
  type HistoryState,
  type ProgressState,
  type SettingState,
} from '../merge';
import type { Changes } from '../data';
import {
  flagOutboxKey,
  historyOutboxKey,
  progressKey,
  readOwner,
  settingOutboxKey,
} from './outbox';
import { cursorKey } from './identity';

export type PullResponse = Omit<Changes, 'devices'>;

export type ChangedKind = 'progress' | 'flags' | 'history' | 'settings';

export interface CursorValue {
  since: number;
  /** Still reading everything for the first time since the sign-in. */
  initial: boolean;
}

export async function readCursor(db: LocalDb, owner: string): Promise<CursorValue> {
  const value = (await db.meta.get(cursorKey(owner)))?.value as CursorValue | undefined;
  return typeof value?.since === 'number' ? value : { since: 0, initial: true };
}

export interface ApplyContext {
  owner: string;
  deviceId: string;
  /** Subtract from a server time to get this device's time. */
  offsetMs: number;
  /** This device's time when the page was asked for. */
  requestedAt: number;
}

const optional = <K extends string>(key: K, value: number | null) =>
  (value === null ? {} : { [key]: value }) as { [P in K]?: number };

const same = (a: object, b: object) => {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => Object.is(x[k], y[k]));
};

/**
 * Applies one page and saves the cursor, in one transaction. `null` (and nothing written) when
 * the tables no longer belong to the account the page is for.
 */
export function applyPage(
  db: LocalDb,
  page: PullResponse,
  context: ApplyContext,
): Promise<Set<ChangedKind> | null> {
  const { owner, deviceId, offsetMs, requestedAt } = context;
  const here = (time: number) => Math.max(0, Math.round(time - offsetMs));
  const hereOrNull = (time: number | null) => (time === null ? null : here(time));

  return db.transaction(
    'rw',
    [db.progress, db.likes, db.listenLater, db.history, db.settings, db.meta, db.outbox],
    async () => {
      if ((await readOwner(db)) !== owner) return null;
      const cursor = await readCursor(db, owner);
      const changed = new Set<ChangedKind>();

      /**
       * What the local row should be, or `undefined` to leave it. `incoming` is already in
       * this device's time.
       */
      async function decide<S extends { updatedAt: number; deviceId: string }>(
        local: S | undefined,
        incoming: S,
        outboxKey: string,
        merge: (a: S, b: S) => S,
      ): Promise<S | undefined> {
        if (!local) return incoming;
        const waiting = await db.outbox.get([owner, outboxKey]);
        if (cursor.initial && !waiting && local.updatedAt <= requestedAt) return incoming;
        // Our own write coming back. The local row is the original.
        if (incoming.deviceId === deviceId) return undefined;
        return merge(local, incoming);
      }

      for (const row of page.progress) {
        const record = await db.progress.get(row.bookId);
        const local: ProgressState | undefined = record && {
          ...record,
          dismissedAt: record.dismissedAt ?? null,
          deletedAt: record.deletedAt ?? null,
          deviceId,
        };
        const incoming: ProgressState = {
          bookId: row.bookId,
          position: row.position,
          duration: row.duration,
          // A 4-byte float on the server; the player's grid here.
          speed: normalizeSpeed(row.speed),
          finished: row.finished,
          dismissedAt: hereOrNull(row.dismissedAt),
          deletedAt: hereOrNull(row.deletedAt),
          updatedAt: here(row.updatedAt),
          deviceId: row.deviceId,
        };
        const next = await decide(local, incoming, progressKey(row.bookId), (a, b) =>
          mergeProgress(a, b, { merge: false }),
        );
        if (!next || next === local) continue;
        const saved: ProgressRecord = {
          bookId: next.bookId,
          position: next.position,
          duration: next.duration,
          speed: next.speed,
          finished: next.finished,
          updatedAt: next.updatedAt,
          ...optional('dismissedAt', next.dismissedAt),
          ...optional('deletedAt', next.deletedAt),
        };
        // `pausedAt` is this device's own note for the smart rewind: keep it only while the
        // place is the same.
        if (record?.pausedAt !== undefined && record.position === saved.position) {
          saved.pausedAt = record.pausedAt;
        }
        if (record && same(record, saved)) continue;
        await db.progress.put(saved);
        changed.add('progress');
      }

      for (const row of page.flags) {
        const table = row.kind === 'like' ? db.likes : db.listenLater;
        const record = await table.get(row.bookId);
        const local: FlagState | undefined = record && {
          ...record,
          kind: row.kind,
          deletedAt: record.deletedAt ?? null,
        };
        const incoming: FlagState = {
          bookId: row.bookId,
          kind: row.kind,
          addedAt: here(row.addedAt),
          deletedAt: hereOrNull(row.deletedAt),
          updatedAt: here(row.updatedAt),
          deviceId: row.deviceId,
        };
        const next = await decide(local, incoming, flagOutboxKey(row.bookId, row.kind), mergeFlag);
        if (!next) continue;
        const saved: FlagRecord = {
          bookId: next.bookId,
          addedAt: next.addedAt,
          updatedAt: next.updatedAt,
          deviceId: next.deviceId,
          ...optional('deletedAt', next.deletedAt),
        };
        if (record && same(record, saved)) continue;
        await table.put(saved);
        changed.add('flags');
      }

      for (const row of page.history) {
        const record = await db.history.get(row.bookId);
        const local: HistoryState | undefined = record && {
          ...record,
          finishedAt: record.finishedAt ?? null,
          deletedAt: record.deletedAt ?? null,
        };
        const incoming: HistoryState = {
          bookId: row.bookId,
          startedAt: here(row.startedAt),
          lastPlayedAt: here(row.lastPlayedAt),
          finishedAt: hereOrNull(row.finishedAt),
          deletedAt: hereOrNull(row.deletedAt),
          updatedAt: here(row.updatedAt),
          deviceId: row.deviceId,
        };
        const next = await decide(local, incoming, historyOutboxKey(row.bookId), (a, b) =>
          mergeHistory(a, b, { merge: false }),
        );
        if (!next) continue;
        const saved: HistoryRecord = {
          bookId: next.bookId,
          startedAt: next.startedAt,
          lastPlayedAt: next.lastPlayedAt,
          updatedAt: next.updatedAt,
          deviceId: next.deviceId,
          ...optional('finishedAt', next.finishedAt),
          ...optional('deletedAt', next.deletedAt),
        };
        if (record && same(record, saved)) continue;
        await db.history.put(saved);
        changed.add('history');
      }

      for (const row of page.settings) {
        // A key or value this version of the app does not know is left alone.
        if (!validateSetting(row.key, row.value).ok) continue;
        const record: SettingState | undefined = await db.settings.get(row.key);
        const incoming: SettingState = {
          key: row.key,
          value: row.value,
          updatedAt: here(row.updatedAt),
          deviceId: row.deviceId,
        };
        const next = await decide(record, incoming, settingOutboxKey(row.key), mergeSetting);
        if (!next) continue;
        const saved: SettingRecord = { ...next };
        if (record && same(record, saved)) continue;
        await db.settings.put(saved);
        changed.add('settings');
      }

      const value: CursorValue = { since: page.cursor, initial: cursor.initial && page.hasMore };
      await db.meta.put({ key: cursorKey(owner), value });
      return changed;
    },
  );
}
