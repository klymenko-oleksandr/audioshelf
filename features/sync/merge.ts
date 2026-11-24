/**
 * Every sync merge rule, in one place (Phase 6b; PRD: Progress sync; ADR 4). Pure: no database,
 * no framework, no clock of its own. The server reads what it stores for the items in a push,
 * asks `planMerge` what the result is, and writes only what changed.
 *
 * Times are milliseconds since the epoch. Incoming times come from the pushing device's clock
 * and are corrected into server time first (`correctTimestamp`); stored times are always server
 * time.
 *
 * How the rules are built (so they converge, whatever the order of arrival):
 * - Each row type has a total order over its writes — the corrected `updatedAt` first, then a
 *   live row over a tombstone (so an add beats a remove at the same time), then the device id and
 *   the content, so even identical times agree. The winner's fields are the row's fields.
 * - Fields that follow their own rule (a history entry's earliest start and latest last play, a
 *   first sign-in's "furthest position" and "finished is a union") are separate max / min / or
 *   operations on top.
 * Both are commutative, associative and idempotent, so `mergeStates` of any grouping of any
 * order of pushes is the same state; `merge.test.ts` checks that with a seeded property test.
 *
 * What the PRD wording became:
 * - "Union; finished stays finished unless the listener restarted" is the last-write-wins rule:
 *   a stale, unfinished write never clears a finish (it is older), and a newer entry with the
 *   finish cleared is the restart and wins. Only the first sign-in (`merge: true`) makes finished
 *   a true union.
 * - A history entry's earliest start is never reset by a removal: `startedAt` is a minimum over
 *   everything pushed, tombstones included, so the rule stays associative.
 */
import { normalizeSpeed } from '@/features/player/core/rules';
import {
  isSettingKey,
  parseSetting,
  type SettingKey,
  type Settings,
} from '@/features/settings/definitions';

/** A time further ahead than this, after correction, is a clock error and becomes "now". */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type FlagKind = 'like' | 'listen_later';

// ── Clock ──────────────────────────────────────────────────────────────────────

/** How far the device clock is behind the server's: add this to a device time to get server time. */
export function clockOffset(serverNow: number, clientNow: number): number {
  return serverNow - clientNow;
}

/** A device time in server time; more than five minutes in the future after that, server now. */
export function correctTimestamp(timestamp: number, offsetMs: number, serverNow: number): number {
  const corrected = timestamp + offsetMs;
  return corrected - serverNow > FUTURE_TOLERANCE_MS ? serverNow : corrected;
}

export interface Clock {
  offsetMs: number;
  serverNow: number;
}

// ── Rows as stored (server time) ───────────────────────────────────────────────

export interface ProgressState {
  bookId: string;
  position: number;
  duration: number;
  speed: number;
  finished: boolean;
  /** Removed from Continue listening. */
  dismissedAt: number | null;
  /** Tombstone: removed from History. */
  deletedAt: number | null;
  updatedAt: number;
  deviceId: string;
}

export interface FlagState {
  bookId: string;
  kind: FlagKind;
  addedAt: number;
  deletedAt: number | null;
  updatedAt: number;
  deviceId: string;
}

export interface HistoryState {
  bookId: string;
  startedAt: number;
  lastPlayedAt: number;
  finishedAt: number | null;
  deletedAt: number | null;
  updatedAt: number;
  deviceId: string;
}

export interface SettingState {
  key: string;
  value: unknown;
  updatedAt: number;
  deviceId: string;
}

// ── Items as pushed (device time) ──────────────────────────────────────────────

export interface ProgressItem {
  bookId: string;
  position: number;
  duration: number;
  speed: number;
  finished: boolean;
  dismissedAt?: number | null;
  deletedAt?: number | null;
  updatedAt: number;
}

export interface FlagItem {
  bookId: string;
  kind: FlagKind;
  addedAt: number;
  deletedAt?: number | null;
  updatedAt: number;
}

export interface HistoryItem {
  bookId: string;
  startedAt: number;
  lastPlayedAt: number;
  finishedAt?: number | null;
  deletedAt?: number | null;
  updatedAt: number;
}

export interface SettingItem {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface Batch {
  progress: ProgressItem[];
  flags: FlagItem[];
  history: HistoryItem[];
  settings: SettingItem[];
}

export interface PushContext {
  /** The device that is pushing; stamped on every row it changes. */
  deviceId: string;
  /** The device's clock when it sent the request (ms). */
  clientNow: number;
  serverNow: number;
  /** First sign-in: furthest position wins and finished is a union. */
  merge: boolean;
}

// ── Total orders ───────────────────────────────────────────────────────────────

type Part = number | string;

function compare(a: readonly Part[], b: readonly Part[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** The later of two, so `compare(a, b) >= 0` keeps `a`; equal keys mean equal content. */
function pick<T>(a: T, b: T, key: (row: T) => readonly Part[]): T {
  return compare(key(a), key(b)) >= 0 ? a : b;
}

const at = (time: number | null) => time ?? Number.NEGATIVE_INFINITY;
const live = (row: { deletedAt: number | null }) => (row.deletedAt === null ? 1 : 0);

export interface MergeMode {
  merge: boolean;
}

// ── Position ───────────────────────────────────────────────────────────────────

const progressKey = (r: ProgressState): Part[] => [
  r.updatedAt,
  live(r),
  r.deviceId,
  r.position,
  r.duration,
  r.speed,
  at(r.dismissedAt),
  at(r.deletedAt),
  r.finished ? 1 : 0,
];

/** First sign-in: a live row beats a tombstone, then the furthest position, then the later write. */
const progressMergeKey = (r: ProgressState): Part[] => [
  live(r),
  live(r) ? r.position : 0,
  r.updatedAt,
  r.deviceId,
  r.duration,
  r.speed,
  at(r.dismissedAt),
  at(r.deletedAt),
  r.finished ? 1 : 0,
];

export function mergeProgress(a: ProgressState, b: ProgressState, mode: MergeMode): ProgressState {
  if (!mode.merge) return { ...pick(a, b, progressKey) };
  const winner = pick(a, b, progressMergeKey);
  const bothLive = live(a) === 1 && live(b) === 1;
  return bothLive ? { ...winner, finished: a.finished || b.finished } : { ...winner };
}

// ── Likes and Listen later ─────────────────────────────────────────────────────

const flagKey_ = (r: FlagState): Part[] => [
  r.updatedAt,
  live(r),
  r.deviceId,
  r.addedAt,
  at(r.deletedAt),
];

export function mergeFlag(a: FlagState, b: FlagState): FlagState {
  return { ...pick(a, b, flagKey_) };
}

// ── History ────────────────────────────────────────────────────────────────────

const historyKey = (r: HistoryState): Part[] => [
  r.updatedAt,
  live(r),
  r.deviceId,
  at(r.finishedAt),
  at(r.deletedAt),
];

const historyMergeKey = (r: HistoryState): Part[] => [
  live(r),
  r.updatedAt,
  r.deviceId,
  at(r.deletedAt),
  at(r.finishedAt),
];

export function mergeHistory(a: HistoryState, b: HistoryState, mode: MergeMode): HistoryState {
  const winner = pick(a, b, mode.merge ? historyMergeKey : historyKey);
  const merged: HistoryState = {
    ...winner,
    startedAt: Math.min(a.startedAt, b.startedAt),
    lastPlayedAt: Math.max(a.lastPlayedAt, b.lastPlayedAt),
  };
  if (mode.merge && live(a) === 1 && live(b) === 1) {
    // A finish on either side counts; the later finish is kept.
    merged.finishedAt =
      a.finishedAt === null || b.finishedAt === null
        ? (a.finishedAt ?? b.finishedAt)
        : Math.max(a.finishedAt, b.finishedAt);
  }
  return merged;
}

// ── Settings ───────────────────────────────────────────────────────────────────

const settingKey_ = (r: SettingState): Part[] => [
  r.updatedAt,
  r.deviceId,
  JSON.stringify(r.value) ?? '',
];

export function mergeSetting(a: SettingState, b: SettingState): SettingState {
  return { ...pick(a, b, settingKey_) };
}

export type SettingRejection = 'unknown_setting' | 'invalid_value';

export type SettingCheck =
  { ok: true; value: Settings[SettingKey] } | { ok: false; reason: SettingRejection };

/** Only the keys and values `features/settings/definitions.ts` allows are ever stored. */
export function validateSetting(key: string, value: unknown): SettingCheck {
  if (!isSettingKey(key)) return { ok: false, reason: 'unknown_setting' };
  const parsed = parseSetting(key, value);
  return parsed === undefined
    ? { ok: false, reason: 'invalid_value' }
    : { ok: true, value: parsed };
}

// ── State and batches ──────────────────────────────────────────────────────────

/** Rows by their key: the book id (progress, history), `book:kind` (flags), the setting key. */
export interface SyncState {
  progress: Map<string, ProgressState>;
  flags: Map<string, FlagState>;
  history: Map<string, HistoryState>;
  settings: Map<string, SettingState>;
}

export const emptyState = (): SyncState => ({
  progress: new Map(),
  flags: new Map(),
  history: new Map(),
  settings: new Map(),
});

export const flagKey = (bookId: string, kind: FlagKind) => `${bookId}:${kind}`;

function mergeMaps<T>(
  a: ReadonlyMap<string, T>,
  b: ReadonlyMap<string, T>,
  merge: (x: T, y: T) => T,
): Map<string, T> {
  const out = new Map(a);
  for (const [key, row] of b) {
    const existing = out.get(key);
    out.set(key, existing === undefined ? row : merge(existing, row));
  }
  return out;
}

/** Two states merged key by key. Commutative, associative and idempotent. */
export function mergeStates(a: SyncState, b: SyncState, mode: MergeMode): SyncState {
  return {
    progress: mergeMaps(a.progress, b.progress, (x, y) => mergeProgress(x, y, mode)),
    flags: mergeMaps(a.flags, b.flags, mergeFlag),
    history: mergeMaps(a.history, b.history, (x, y) => mergeHistory(x, y, mode)),
    settings: mergeMaps(a.settings, b.settings, mergeSetting),
  };
}

const fix = (time: number, clock: Clock) => correctTimestamp(time, clock.offsetMs, clock.serverNow);
const fixOrNull = (time: number | null | undefined, clock: Clock) =>
  time === null || time === undefined ? null : fix(time, clock);

export function progressFromItem(
  item: ProgressItem,
  deviceId: string,
  clock: Clock,
): ProgressState {
  return {
    bookId: item.bookId,
    position: item.position,
    duration: item.duration,
    // Snapped to the player's grid: the column is a 4-byte float, and a value that does not
    // survive it would look like a change on every push.
    speed: normalizeSpeed(item.speed),
    finished: item.finished,
    dismissedAt: fixOrNull(item.dismissedAt, clock),
    deletedAt: fixOrNull(item.deletedAt, clock),
    updatedAt: fix(item.updatedAt, clock),
    deviceId,
  };
}

export function flagFromItem(item: FlagItem, deviceId: string, clock: Clock): FlagState {
  return {
    bookId: item.bookId,
    kind: item.kind,
    addedAt: fix(item.addedAt, clock),
    deletedAt: fixOrNull(item.deletedAt, clock),
    updatedAt: fix(item.updatedAt, clock),
    deviceId,
  };
}

export function historyFromItem(item: HistoryItem, deviceId: string, clock: Clock): HistoryState {
  return {
    bookId: item.bookId,
    startedAt: fix(item.startedAt, clock),
    lastPlayedAt: fix(item.lastPlayedAt, clock),
    finishedAt: fixOrNull(item.finishedAt, clock),
    deletedAt: fixOrNull(item.deletedAt, clock),
    updatedAt: fix(item.updatedAt, clock),
    deviceId,
  };
}

// ── Planning a push ────────────────────────────────────────────────────────────

export interface Change<T> {
  /** What the server had; `undefined` for a new row. */
  before: T | undefined;
  after: T;
}

export interface RejectedSetting {
  key: string;
  reason: SettingRejection;
}

export interface Plan {
  /** Only rows whose merged result differs from what is stored: nothing else is written. */
  progress: Change<ProgressState>[];
  flags: Change<FlagState>[];
  history: Change<HistoryState>[];
  settings: Change<SettingState>[];
  rejectedSettings: RejectedSetting[];
}

const sameRow = (a: object, b: object) => {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => Object.is(x[k], y[k]));
};

function plan<T extends object>(
  stored: ReadonlyMap<string, T>,
  incoming: ReadonlyMap<string, T>,
  merge: (a: T, b: T) => T,
): Change<T>[] {
  const changes: Change<T>[] = [];
  for (const [key, row] of incoming) {
    const before = stored.get(key);
    const after = before === undefined ? row : merge(before, row);
    if (before === undefined || !sameRow(before, after)) changes.push({ before, after });
  }
  return changes;
}

/** Items of one list, corrected and merged with each other (a batch may repeat an item). */
function collect<I, S>(
  items: readonly I[],
  toState: (item: I) => S | null,
  keyOf: (state: S) => string,
  merge: (a: S, b: S) => S,
): Map<string, S> {
  const out = new Map<string, S>();
  for (const item of items) {
    const state = toState(item);
    if (state === null) continue;
    const key = keyOf(state);
    const existing = out.get(key);
    out.set(key, existing === undefined ? state : merge(existing, state));
  }
  return out;
}

/**
 * What a push changes, given what the server holds for the items in it. `stored` only has to
 * contain the rows the batch touches. Idempotent: planning the same batch against its own result
 * gives an empty plan.
 */
export function planMerge(stored: SyncState, batch: Batch, ctx: PushContext): Plan {
  const clock: Clock = {
    offsetMs: clockOffset(ctx.serverNow, ctx.clientNow),
    serverNow: ctx.serverNow,
  };
  const mode: MergeMode = { merge: ctx.merge };
  const rejectedSettings: RejectedSetting[] = [];

  const progress = collect(
    batch.progress,
    (item) => progressFromItem(item, ctx.deviceId, clock),
    (s) => s.bookId,
    (a, b) => mergeProgress(a, b, mode),
  );
  const flags = collect(
    batch.flags,
    (item) => flagFromItem(item, ctx.deviceId, clock),
    (s) => flagKey(s.bookId, s.kind),
    mergeFlag,
  );
  const history = collect(
    batch.history,
    (item) => historyFromItem(item, ctx.deviceId, clock),
    (s) => s.bookId,
    (a, b) => mergeHistory(a, b, mode),
  );
  const settings = collect(
    batch.settings,
    (item): SettingState | null => {
      const checked = validateSetting(item.key, item.value);
      if (!checked.ok) {
        rejectedSettings.push({ key: item.key, reason: checked.reason });
        return null;
      }
      return {
        key: item.key,
        value: checked.value,
        updatedAt: fix(item.updatedAt, clock),
        deviceId: ctx.deviceId,
      };
    },
    (s) => s.key,
    mergeSetting,
  );

  return {
    progress: plan(stored.progress, progress, (a, b) => mergeProgress(a, b, mode)),
    flags: plan(stored.flags, flags, mergeFlag),
    history: plan(stored.history, history, (a, b) => mergeHistory(a, b, mode)),
    settings: plan(stored.settings, settings, mergeSetting),
    rejectedSettings,
  };
}

/** `planMerge`, applied to an in-memory state (tests, and anything that wants the result). */
export function applyBatch(
  state: SyncState,
  batch: Batch,
  ctx: PushContext,
): { state: SyncState; plan: Plan } {
  const result = planMerge(state, batch, ctx);
  const next: SyncState = {
    progress: new Map(state.progress),
    flags: new Map(state.flags),
    history: new Map(state.history),
    settings: new Map(state.settings),
  };
  for (const { after } of result.progress) next.progress.set(after.bookId, after);
  for (const { after } of result.flags) next.flags.set(flagKey(after.bookId, after.kind), after);
  for (const { after } of result.history) next.history.set(after.bookId, after);
  for (const { after } of result.settings) next.settings.set(after.key, after);
  return { state: next, plan: result };
}
