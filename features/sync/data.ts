/**
 * The sync tables (Phase 6b): `applyPush` stores what a push changes, `readChanges` reads what
 * changed after a cursor. Every merge decision is `merge.ts`; this file reads the rows a batch
 * touches, asks for the plan and writes only the rows that changed.
 *
 * - `applyPush` takes a transaction handle and uses nothing else (never the outer `db` inside
 *   `db.transaction`: it waits for the transaction and deadlocks). The caller runs it in one
 *   transaction, so a batch is all or nothing.
 * - Pushes of one listener are serialised with a transaction-scoped advisory lock. The cursor is
 *   a number from a global sequence taken *while the lock is held*, so for one listener the order
 *   of `seq` is the order of commits: a pull can never skip a row that commits late. (Between
 *   different listeners the order is not defined, and nothing needs it.) Re-reading is harmless
 *   anyway: clients apply rows idempotently, so a client may keep an overlap.
 * - A row whose merged result equals what is stored is not written at all, so it keeps its
 *   `seq` and pulls do not see it again.
 * - Page-style reads go through `readDb` in the route (`readChanges` takes the handle it is given).
 */
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import {
  books,
  syncDevices,
  syncFlags,
  syncHistory,
  syncProgress,
  syncSettings,
} from '@/db/schema';
import {
  clockOffset,
  emptyState,
  flagKey,
  planMerge,
  type FlagState,
  type HistoryState,
  type ProgressState,
  type PushContext,
  type SettingRejection,
  type SettingState,
  type SyncState,
} from './merge';
import type { PushRequest } from './request';

export type SyncDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** One pull answers with at most this many rows (all kinds together). */
export const PULL_LIMIT = 1000;

const INT32_MAX = 2_147_483_647;
const clampInt32 = (n: number) => Math.max(-INT32_MAX, Math.min(INT32_MAX, Math.trunc(n)));

const ms = (date: Date) => date.getTime();
const msOrNull = (date: Date | null) => (date === null ? null : date.getTime());
const date = (time: number) => new Date(time);
const dateOrNull = (time: number | null) => (time === null ? null : new Date(time));

// ── Rows on the wire (pull) ────────────────────────────────────────────────────

export interface ProgressRow extends ProgressState {
  seq: number;
}
export interface FlagRow extends FlagState {
  seq: number;
}
export interface HistoryRow extends HistoryState {
  seq: number;
}
export interface SettingRow extends SettingState {
  seq: number;
}
export interface DeviceRow {
  id: string;
  name: string;
  lastPushAt: number | null;
}

type DbProgress = typeof syncProgress.$inferSelect;
type DbFlag = typeof syncFlags.$inferSelect;
type DbHistory = typeof syncHistory.$inferSelect;
type DbSetting = typeof syncSettings.$inferSelect;

const progressOf = (r: DbProgress): ProgressRow => ({
  bookId: r.bookId,
  position: r.positionSeconds,
  duration: r.durationSeconds,
  speed: r.speed,
  finished: r.finished,
  dismissedAt: msOrNull(r.dismissedAt),
  deletedAt: msOrNull(r.deletedAt),
  updatedAt: ms(r.updatedAt),
  deviceId: r.deviceId,
  seq: r.seq,
});

const flagOf = (r: DbFlag): FlagRow => ({
  bookId: r.bookId,
  kind: r.kind,
  addedAt: ms(r.addedAt),
  deletedAt: msOrNull(r.deletedAt),
  updatedAt: ms(r.updatedAt),
  deviceId: r.deviceId,
  seq: r.seq,
});

const historyOf = (r: DbHistory): HistoryRow => ({
  bookId: r.bookId,
  startedAt: ms(r.startedAt),
  lastPlayedAt: ms(r.lastPlayedAt),
  finishedAt: msOrNull(r.finishedAt),
  deletedAt: msOrNull(r.deletedAt),
  updatedAt: ms(r.updatedAt),
  deviceId: r.deviceId,
  seq: r.seq,
});

const settingOf = (r: DbSetting): SettingRow => ({
  key: r.key,
  value: r.value,
  updatedAt: ms(r.updatedAt),
  deviceId: r.deviceId,
  seq: r.seq,
});

/** The state `planMerge` compares with: the stored rows without their `seq`. */
function omitSeq<T extends { seq: number }>(row: T): Omit<T, 'seq'> {
  const copy: Partial<T> = { ...row };
  delete copy.seq;
  return copy as Omit<T, 'seq'>;
}

function stateOf(rows: {
  progress: DbProgress[];
  flags: DbFlag[];
  history: DbHistory[];
  settings: DbSetting[];
}): SyncState {
  const state = emptyState();
  for (const r of rows.progress) {
    const row = omitSeq(progressOf(r));
    state.progress.set(row.bookId, row);
  }
  for (const r of rows.flags) {
    const row = omitSeq(flagOf(r));
    state.flags.set(flagKey(row.bookId, row.kind), row);
  }
  for (const r of rows.history) {
    const row = omitSeq(historyOf(r));
    state.history.set(row.bookId, row);
  }
  for (const r of rows.settings) {
    const row = omitSeq(settingOf(r));
    state.settings.set(row.key, row);
  }
  return state;
}

// ── Push ───────────────────────────────────────────────────────────────────────

export type Dropped =
  | { kind: 'progress' | 'flag' | 'history'; bookId: string; reason: 'unknown_book' }
  | { kind: 'setting'; key: string; reason: SettingRejection };

export interface PushResult {
  serverNow: number;
  /** The highest `seq` this listener has now. A client keeps pulling with its own cursor. */
  cursor: number;
  /** Rows that really changed (inserted or updated); items that lost or matched are not counted. */
  applied: { progress: number; flags: number; history: number; settings: number };
  dropped: Dropped[];
}

export interface SyncOptions {
  /** The clock, for tests. */
  now?: () => number;
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);
const nextSeq = sql`nextval('sync_change_seq')`;

const unique = <T>(list: readonly T[]) => [...new Set(list)];

/**
 * Applies a push inside the caller's transaction. Throws on a database error, which rolls the whole
 * batch back. Items for a book that does not exist (deleted from the database) are dropped and
 * reported, and settings that are not allowed are dropped and reported; nothing else fails a batch.
 */
export async function applyPush(
  tx: SyncDb,
  userId: string,
  request: PushRequest,
  options: SyncOptions = {},
): Promise<PushResult> {
  const serverNow = (options.now ?? Date.now)();

  // One push per listener at a time; released when the transaction ends.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sync:${userId}`}, 0))`);

  await tx
    .insert(syncDevices)
    .values({
      userId,
      deviceId: request.deviceId,
      name: request.deviceName,
      clockOffsetMs: clampInt32(clockOffset(serverNow, request.clientNow)),
      lastPushAt: date(serverNow),
      lastSeenAt: date(serverNow),
    })
    .onConflictDoUpdate({
      target: [syncDevices.userId, syncDevices.deviceId],
      set: {
        // A push without a name keeps the one the device already has.
        name: sql`case when excluded."name" = '' then ${syncDevices.name} else excluded."name" end`,
        clockOffsetMs: excluded('clock_offset_ms'),
        lastPushAt: excluded('last_push_at'),
        lastSeenAt: excluded('last_seen_at'),
      },
    });

  const { changes } = request;
  const dropped: Dropped[] = [];

  // A book that is not in the database any more cannot be referenced. Unpublished and
  // soft-deleted books are still rows, so their data is kept.
  const wanted = unique([
    ...changes.progress.map((i) => i.bookId),
    ...changes.flags.map((i) => i.bookId),
    ...changes.history.map((i) => i.bookId),
  ]);
  const known = new Set(
    wanted.length === 0
      ? []
      : (await tx.select({ id: books.id }).from(books).where(inArray(books.id, wanted))).map(
          (r) => r.id,
        ),
  );
  const keep = <T extends { bookId: string }>(items: T[], kind: 'progress' | 'flag' | 'history') =>
    items.filter((item) => {
      if (known.has(item.bookId)) return true;
      dropped.push({ kind, bookId: item.bookId, reason: 'unknown_book' });
      return false;
    });
  const batch = {
    progress: keep(changes.progress, 'progress'),
    flags: keep(changes.flags, 'flag'),
    history: keep(changes.history, 'history'),
    settings: changes.settings,
  };

  const progressIds = unique(batch.progress.map((i) => i.bookId));
  const flagIds = unique(batch.flags.map((i) => i.bookId));
  const historyIds = unique(batch.history.map((i) => i.bookId));
  const settingKeys = unique(batch.settings.map((i) => i.key));

  const stored = stateOf({
    progress: progressIds.length
      ? await tx
          .select()
          .from(syncProgress)
          .where(and(eq(syncProgress.userId, userId), inArray(syncProgress.bookId, progressIds)))
      : [],
    flags: flagIds.length
      ? await tx
          .select()
          .from(syncFlags)
          .where(and(eq(syncFlags.userId, userId), inArray(syncFlags.bookId, flagIds)))
      : [],
    history: historyIds.length
      ? await tx
          .select()
          .from(syncHistory)
          .where(and(eq(syncHistory.userId, userId), inArray(syncHistory.bookId, historyIds)))
      : [],
    settings: settingKeys.length
      ? await tx
          .select()
          .from(syncSettings)
          .where(and(eq(syncSettings.userId, userId), inArray(syncSettings.key, settingKeys)))
      : [],
  });

  const ctx: PushContext = {
    deviceId: request.deviceId,
    clientNow: request.clientNow,
    serverNow,
    merge: request.merge,
  };
  const plan = planMerge(stored, batch, ctx);
  for (const rejected of plan.rejectedSettings) {
    dropped.push({ kind: 'setting', key: rejected.key, reason: rejected.reason });
  }

  // Every changed row takes a new `seq` (inserts through the column default, updates here).
  if (plan.progress.length > 0) {
    await tx
      .insert(syncProgress)
      .values(
        plan.progress.map(({ after: r }) => ({
          userId,
          bookId: r.bookId,
          positionSeconds: r.position,
          durationSeconds: r.duration,
          speed: r.speed,
          finished: r.finished,
          dismissedAt: dateOrNull(r.dismissedAt),
          deletedAt: dateOrNull(r.deletedAt),
          updatedAt: date(r.updatedAt),
          deviceId: r.deviceId,
        })),
      )
      .onConflictDoUpdate({
        target: [syncProgress.userId, syncProgress.bookId],
        set: {
          positionSeconds: excluded('position_seconds'),
          durationSeconds: excluded('duration_seconds'),
          speed: excluded('speed'),
          finished: excluded('finished'),
          dismissedAt: excluded('dismissed_at'),
          deletedAt: excluded('deleted_at'),
          updatedAt: excluded('updated_at'),
          deviceId: excluded('device_id'),
          seq: nextSeq,
        },
      });
  }

  if (plan.flags.length > 0) {
    await tx
      .insert(syncFlags)
      .values(
        plan.flags.map(({ after: r }) => ({
          userId,
          bookId: r.bookId,
          kind: r.kind,
          addedAt: date(r.addedAt),
          deletedAt: dateOrNull(r.deletedAt),
          updatedAt: date(r.updatedAt),
          deviceId: r.deviceId,
        })),
      )
      .onConflictDoUpdate({
        target: [syncFlags.userId, syncFlags.bookId, syncFlags.kind],
        set: {
          addedAt: excluded('added_at'),
          deletedAt: excluded('deleted_at'),
          updatedAt: excluded('updated_at'),
          deviceId: excluded('device_id'),
          seq: nextSeq,
        },
      });
  }

  if (plan.history.length > 0) {
    await tx
      .insert(syncHistory)
      .values(
        plan.history.map(({ after: r }) => ({
          userId,
          bookId: r.bookId,
          startedAt: date(r.startedAt),
          lastPlayedAt: date(r.lastPlayedAt),
          finishedAt: dateOrNull(r.finishedAt),
          deletedAt: dateOrNull(r.deletedAt),
          updatedAt: date(r.updatedAt),
          deviceId: r.deviceId,
        })),
      )
      .onConflictDoUpdate({
        target: [syncHistory.userId, syncHistory.bookId],
        set: {
          startedAt: excluded('started_at'),
          lastPlayedAt: excluded('last_played_at'),
          finishedAt: excluded('finished_at'),
          deletedAt: excluded('deleted_at'),
          updatedAt: excluded('updated_at'),
          deviceId: excluded('device_id'),
          seq: nextSeq,
        },
      });
  }

  if (plan.settings.length > 0) {
    await tx
      .insert(syncSettings)
      .values(
        plan.settings.map(({ after: r }) => ({
          userId,
          key: r.key,
          value: r.value,
          updatedAt: date(r.updatedAt),
          deviceId: r.deviceId,
        })),
      )
      .onConflictDoUpdate({
        target: [syncSettings.userId, syncSettings.key],
        set: {
          value: excluded('value'),
          updatedAt: excluded('updated_at'),
          deviceId: excluded('device_id'),
          seq: nextSeq,
        },
      });
  }

  return {
    serverNow,
    cursor: await highestSeq(tx, userId),
    applied: {
      progress: plan.progress.length,
      flags: plan.flags.length,
      history: plan.history.length,
      settings: plan.settings.length,
    },
    dropped,
  };
}

/** The highest `seq` a listener has in any table (0 when there is none). */
export async function highestSeq(db: SyncDb, userId: string): Promise<number> {
  const maxOf = async (
    table: typeof syncProgress | typeof syncFlags | typeof syncHistory | typeof syncSettings,
  ) => {
    const [row] = await db
      .select({ top: sql<number>`coalesce(max(${table.seq}), 0)`.mapWith(Number) })
      .from(table)
      .where(eq(table.userId, userId));
    return row?.top ?? 0;
  };
  return Math.max(
    await maxOf(syncProgress),
    await maxOf(syncFlags),
    await maxOf(syncHistory),
    await maxOf(syncSettings),
  );
}

// ── Pull ───────────────────────────────────────────────────────────────────────

export interface Changes {
  /** Pass it back as `since`. Never lower than the `since` it answers. */
  cursor: number;
  serverNow: number;
  /** More rows are waiting after `cursor`: pull again at once. */
  hasMore: boolean;
  progress: ProgressRow[];
  flags: FlagRow[];
  history: HistoryRow[];
  settings: SettingRow[];
  devices: DeviceRow[];
}

export interface ReadOptions extends SyncOptions {
  /** Rows per call, all kinds together. */
  limit?: number;
}

/**
 * Every row of one listener changed after `since`, tombstones included, oldest first and cut at
 * `limit` rows across all kinds. Because `seq` is one sequence, "everything up to the cursor" is
 * complete: the cut falls between two rows, never inside one table's run.
 */
export async function readChanges(
  db: SyncDb,
  userId: string,
  since: number,
  options: ReadOptions = {},
): Promise<Changes> {
  const limit = options.limit ?? PULL_LIMIT;
  const serverNow = (options.now ?? Date.now)();
  const take = limit + 1;

  const progress = await db
    .select()
    .from(syncProgress)
    .where(and(eq(syncProgress.userId, userId), gt(syncProgress.seq, since)))
    .orderBy(asc(syncProgress.seq))
    .limit(take);
  const flags = await db
    .select()
    .from(syncFlags)
    .where(and(eq(syncFlags.userId, userId), gt(syncFlags.seq, since)))
    .orderBy(asc(syncFlags.seq))
    .limit(take);
  const history = await db
    .select()
    .from(syncHistory)
    .where(and(eq(syncHistory.userId, userId), gt(syncHistory.seq, since)))
    .orderBy(asc(syncHistory.seq))
    .limit(take);
  const settings = await db
    .select()
    .from(syncSettings)
    .where(and(eq(syncSettings.userId, userId), gt(syncSettings.seq, since)))
    .orderBy(asc(syncSettings.seq))
    .limit(take);

  // Each list holds its own `limit + 1` oldest rows, so the oldest `limit + 1` of all of them are
  // in here. Keep the first `limit` of those.
  const tagged = [
    ...progress.map((row) => ({ seq: row.seq, table: 'progress' as const, row: progressOf(row) })),
    ...flags.map((row) => ({ seq: row.seq, table: 'flags' as const, row: flagOf(row) })),
    ...history.map((row) => ({ seq: row.seq, table: 'history' as const, row: historyOf(row) })),
    ...settings.map((row) => ({ seq: row.seq, table: 'settings' as const, row: settingOf(row) })),
  ].sort((a, b) => a.seq - b.seq);
  const hasMore = tagged.length > limit;
  const page = hasMore ? tagged.slice(0, limit) : tagged;

  const out: Changes = {
    cursor: Math.max(since, page.at(-1)?.seq ?? since),
    serverNow,
    hasMore,
    progress: [],
    flags: [],
    history: [],
    settings: [],
    devices: await listDevices(db, userId),
  };
  for (const entry of page) {
    if (entry.table === 'progress') out.progress.push(entry.row);
    else if (entry.table === 'flags') out.flags.push(entry.row);
    else if (entry.table === 'history') out.history.push(entry.row);
    else out.settings.push(entry.row);
  }
  return out;
}

/** The listener's devices, most recent push first (for the conflict prompt, 6d). */
export async function listDevices(db: SyncDb, userId: string): Promise<DeviceRow[]> {
  const rows = await db
    .select()
    .from(syncDevices)
    .where(eq(syncDevices.userId, userId))
    .orderBy(sql`${syncDevices.lastPushAt} desc nulls last`, asc(syncDevices.deviceId));
  return rows.map((r) => ({ id: r.deviceId, name: r.name, lastPushAt: msOrNull(r.lastPushAt) }));
}

/** Notes that a known device asked for changes. Does nothing for a device that has not pushed yet. */
export async function touchDevice(
  db: SyncDb,
  userId: string,
  deviceId: string,
  options: SyncOptions = {},
): Promise<void> {
  const now = (options.now ?? Date.now)();
  await db
    .update(syncDevices)
    .set({ lastSeenAt: date(now) })
    .where(and(eq(syncDevices.userId, userId), eq(syncDevices.deviceId, deviceId)));
}
