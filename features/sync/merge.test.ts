// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FUTURE_TOLERANCE_MS,
  applyBatch,
  clockOffset,
  correctTimestamp,
  emptyState,
  flagKey,
  mergeFlag,
  mergeHistory,
  mergeProgress,
  mergeSetting,
  mergeStates,
  planMerge,
  validateSetting,
  type Batch,
  type FlagState,
  type HistoryState,
  type ProgressState,
  type PushContext,
  type SettingState,
  type SyncState,
} from './merge';

const BOOK = '11111111-1111-4111-8111-111111111111';
const BOOK2 = '22222222-2222-4222-8222-222222222222';
const PHONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LAPTOP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

// ── Builders ───────────────────────────────────────────────────────────────────

const progress = (o: Partial<ProgressState> = {}): ProgressState => ({
  bookId: BOOK,
  position: 100,
  duration: 1000,
  speed: 1,
  finished: false,
  dismissedAt: null,
  deletedAt: null,
  updatedAt: 1000,
  deviceId: PHONE,
  ...o,
});
const flag = (o: Partial<FlagState> = {}): FlagState => ({
  bookId: BOOK,
  kind: 'like',
  addedAt: 1000,
  deletedAt: null,
  updatedAt: 1000,
  deviceId: PHONE,
  ...o,
});
const history = (o: Partial<HistoryState> = {}): HistoryState => ({
  bookId: BOOK,
  startedAt: 1000,
  lastPlayedAt: 2000,
  finishedAt: null,
  deletedAt: null,
  updatedAt: 2000,
  deviceId: PHONE,
  ...o,
});
const setting = (o: Partial<SettingState> = {}): SettingState => ({
  key: 'theme',
  value: 'dark',
  updatedAt: 1000,
  deviceId: PHONE,
  ...o,
});

/** Both orders of arrival must give the same answer. */
function bothWays<T>(merge: (a: T, b: T) => T, a: T, b: T): T {
  const ab = merge(a, b);
  expect(merge(b, a)).toEqual(ab);
  return ab;
}

const LWW = { merge: false };
const FIRST_SIGN_IN = { merge: true };

// ── Clock ──────────────────────────────────────────────────────────────────────

describe('clock', () => {
  it('the offset is server now minus client now', () => {
    expect(clockOffset(10_000, 4_000)).toBe(6_000);
    expect(clockOffset(4_000, 10_000)).toBe(-6_000);
  });

  it('shifts a timestamp by the offset', () => {
    expect(correctTimestamp(1_000_000, 5_000, NOW)).toBe(1_005_000);
    expect(correctTimestamp(1_000_000, -5_000, NOW)).toBe(995_000);
  });

  it('keeps a timestamp up to five minutes ahead of the server', () => {
    expect(correctTimestamp(NOW + FUTURE_TOLERANCE_MS, 0, NOW)).toBe(NOW + FUTURE_TOLERANCE_MS);
    expect(correctTimestamp(NOW + 1, 0, NOW)).toBe(NOW + 1);
  });

  it('clamps a timestamp more than five minutes ahead to server now', () => {
    expect(correctTimestamp(NOW + FUTURE_TOLERANCE_MS + 1, 0, NOW)).toBe(NOW);
    expect(correctTimestamp(NOW + 24 * 60 * MIN, 0, NOW)).toBe(NOW);
  });

  it('clamps after the correction, not before', () => {
    // The device clock is 1 h fast: its "now" is server now + 1 h, and corrects back to server now.
    const offset = clockOffset(NOW, NOW + 60 * MIN);
    expect(correctTimestamp(NOW + 60 * MIN, offset, NOW)).toBe(NOW);
    // A time 10 minutes after the device's now is 10 minutes after server now: clamped.
    expect(correctTimestamp(NOW + 70 * MIN, offset, NOW)).toBe(NOW);
    // A slow clock: 1 h behind, so its timestamps move forward.
    const slow = clockOffset(NOW, NOW - 60 * MIN);
    expect(correctTimestamp(NOW - 60 * MIN - 5_000, slow, NOW)).toBe(NOW - 5_000);
  });

  it('never moves a timestamp from the past', () => {
    expect(correctTimestamp(0, 0, NOW)).toBe(0);
  });
});

// ── Position ───────────────────────────────────────────────────────────────────

describe('progress: last write wins', () => {
  it('the later write wins, in both orders', () => {
    const older = progress({ position: 500, updatedAt: 1000, deviceId: PHONE });
    const newer = progress({ position: 200, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), older, newer)).toEqual(newer);
  });

  it('a newer write may go backwards', () => {
    const ahead = progress({ position: 900, updatedAt: 1000 });
    const back = progress({ position: 10, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), ahead, back).position).toBe(10);
  });

  it('takes every field from the winner and remembers who wrote it', () => {
    const a = progress({ position: 5, duration: 50, speed: 1.5, updatedAt: 1000 });
    const b = progress({ position: 7, duration: 70, speed: 2, updatedAt: 3000, deviceId: LAPTOP });
    const merged = bothWays((x, y) => mergeProgress(x, y, LWW), a, b);
    expect(merged).toEqual(b);
    expect(merged.deviceId).toBe(LAPTOP);
  });

  it('equal times are decided the same way in both orders', () => {
    const a = progress({ position: 5, deviceId: PHONE });
    const b = progress({ position: 9, deviceId: LAPTOP });
    const winner = bothWays((x, y) => mergeProgress(x, y, LWW), a, b);
    expect([a, b]).toContainEqual(winner);
  });

  it('merging a row with itself changes nothing', () => {
    const a = progress();
    expect(mergeProgress(a, a, LWW)).toEqual(a);
  });
});

describe('progress: finished', () => {
  it('stays finished when an older, unfinished write arrives later', () => {
    const finished = progress({ finished: true, position: 1000, updatedAt: 5000 });
    const stale = progress({ finished: false, position: 400, updatedAt: 3000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), finished, stale)).toEqual(finished);
  });

  it('a newer unfinished write is a restart and clears it', () => {
    const finished = progress({ finished: true, position: 1000, updatedAt: 3000 });
    const restart = progress({ finished: false, position: 5, updatedAt: 5000, deviceId: LAPTOP });
    const merged = bothWays((a, b) => mergeProgress(a, b, LWW), finished, restart);
    expect(merged.finished).toBe(false);
    expect(merged.position).toBe(5);
  });

  it('a newer finish beats an older unfinished write', () => {
    const open = progress({ finished: false, updatedAt: 1000 });
    const done = progress({ finished: true, position: 1000, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), open, done).finished).toBe(true);
  });
});

describe('progress: tombstone and dismissed', () => {
  it('a newer tombstone removes the row, a newer write brings it back', () => {
    const live = progress({ updatedAt: 1000 });
    const gone = progress({ deletedAt: 2000, updatedAt: 2000, deviceId: LAPTOP });
    const again = progress({ position: 42, updatedAt: 3000 });
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), live, gone).deletedAt).toBe(2000);
    const back = bothWays((a, b) => mergeProgress(a, b, LWW), gone, again);
    expect(back.deletedAt).toBeNull();
    expect(back.position).toBe(42);
  });

  it('a write at the same time as a tombstone wins over it', () => {
    const live = progress({ position: 30, updatedAt: 2000 });
    const gone = progress({ deletedAt: 2000, updatedAt: 2000, deviceId: LAPTOP });
    const merged = bothWays((a, b) => mergeProgress(a, b, LWW), live, gone);
    expect(merged.deletedAt).toBeNull();
    expect(merged.position).toBe(30);
  });

  it('dismissedAt follows the winning row, and playing again clears it', () => {
    const dismissed = progress({ dismissedAt: 2000, updatedAt: 2000 });
    const playedAfter = progress({ position: 300, dismissedAt: null, updatedAt: 3000 });
    const playedBefore = progress({ position: 300, dismissedAt: null, updatedAt: 1000 });
    expect(
      bothWays((a, b) => mergeProgress(a, b, LWW), dismissed, playedAfter).dismissedAt,
    ).toBeNull();
    expect(bothWays((a, b) => mergeProgress(a, b, LWW), dismissed, playedBefore).dismissedAt).toBe(
      2000,
    );
  });

  it('two tombstones: the later one wins', () => {
    const a = progress({ deletedAt: 2000, updatedAt: 2000 });
    const b = progress({ deletedAt: 3000, updatedAt: 3000, deviceId: LAPTOP });
    expect(bothWays((x, y) => mergeProgress(x, y, LWW), a, b)).toEqual(b);
  });
});

describe('progress: first sign-in (merge: true)', () => {
  it('the furthest position wins even when it is older', () => {
    const server = progress({ position: 900, updatedAt: 1000, deviceId: LAPTOP });
    const guest = progress({ position: 100, updatedAt: 9000, deviceId: PHONE });
    const merged = bothWays((a, b) => mergeProgress(a, b, FIRST_SIGN_IN), server, guest);
    expect(merged.position).toBe(900);
    expect(merged.deviceId).toBe(LAPTOP);
  });

  it('finished is a union', () => {
    const finished = progress({ finished: true, position: 1000, updatedAt: 1000 });
    const further = progress({
      finished: false,
      position: 1000,
      updatedAt: 9000,
      deviceId: LAPTOP,
    });
    const behind = progress({ finished: false, position: 10, updatedAt: 9000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, FIRST_SIGN_IN), finished, further).finished).toBe(
      true,
    );
    const m = bothWays((a, b) => mergeProgress(a, b, FIRST_SIGN_IN), finished, behind);
    expect(m.finished).toBe(true);
    expect(m.position).toBe(1000);
  });

  it('equal positions fall back to the later write', () => {
    const a = progress({ position: 500, updatedAt: 1000 });
    const b = progress({ position: 500, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays((x, y) => mergeProgress(x, y, FIRST_SIGN_IN), a, b)).toEqual(b);
  });

  it('a live row beats a tombstone: signing in never loses what the guest listened to', () => {
    const gone = progress({ deletedAt: 9000, updatedAt: 9000, position: 999 });
    const guest = progress({ position: 5, updatedAt: 1000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeProgress(a, b, FIRST_SIGN_IN), gone, guest)).toEqual(guest);
  });

  it('two tombstones still go by the later one', () => {
    const a = progress({ deletedAt: 2000, updatedAt: 2000 });
    const b = progress({ deletedAt: 3000, updatedAt: 3000, deviceId: LAPTOP });
    expect(bothWays((x, y) => mergeProgress(x, y, FIRST_SIGN_IN), a, b)).toEqual(b);
  });
});

// ── Likes and Listen later ─────────────────────────────────────────────────────

describe('flags: per-item last write wins', () => {
  it('add then remove: the remove is the later write', () => {
    const add = flag({ addedAt: 1000, updatedAt: 1000 });
    const remove = flag({ addedAt: 1000, deletedAt: 2000, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays(mergeFlag, add, remove).deletedAt).toBe(2000);
  });

  it('remove then add again: the add wins and addedAt is the new one', () => {
    const remove = flag({ addedAt: 1000, deletedAt: 2000, updatedAt: 2000 });
    const addAgain = flag({ addedAt: 3000, updatedAt: 3000, deviceId: LAPTOP });
    const merged = bothWays(mergeFlag, remove, addAgain);
    expect(merged.deletedAt).toBeNull();
    expect(merged.addedAt).toBe(3000);
  });

  it('an old remove arriving after a newer add changes nothing', () => {
    const add = flag({ addedAt: 3000, updatedAt: 3000 });
    const oldRemove = flag({ addedAt: 1000, deletedAt: 2000, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays(mergeFlag, add, oldRemove)).toEqual(add);
  });

  it('equal times: the add wins, in both orders', () => {
    const add = flag({ addedAt: 2000, updatedAt: 2000, deviceId: PHONE });
    const remove = flag({ addedAt: 1000, deletedAt: 2000, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays(mergeFlag, add, remove)).toEqual(add);
    // …whichever device wrote which.
    const addOnLaptop = { ...add, deviceId: LAPTOP };
    const removeOnPhone = { ...remove, deviceId: PHONE };
    expect(bothWays(mergeFlag, addOnLaptop, removeOnPhone)).toEqual(addOnLaptop);
  });

  it('addedAt follows the winning row', () => {
    const a = flag({ addedAt: 500, updatedAt: 1000 });
    const b = flag({ addedAt: 900, updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays(mergeFlag, a, b).addedAt).toBe(900);
  });

  it('two adds at the same time agree in both orders', () => {
    const a = flag({ addedAt: 700, updatedAt: 1000, deviceId: PHONE });
    const b = flag({ addedAt: 800, updatedAt: 1000, deviceId: LAPTOP });
    const merged = bothWays(mergeFlag, a, b);
    expect([a, b]).toContainEqual(merged);
  });

  it('a like and Listen later of one book are separate items', () => {
    expect(flagKey(BOOK, 'like')).not.toBe(flagKey(BOOK, 'listen_later'));
    expect(flagKey(BOOK, 'like')).not.toBe(flagKey(BOOK2, 'like'));
  });
});

// ── History ────────────────────────────────────────────────────────────────────

describe('history', () => {
  it('keeps the earliest start and the latest last play, whichever row wins', () => {
    const early = history({ startedAt: 1000, lastPlayedAt: 3000, updatedAt: 3000 });
    const late = history({
      startedAt: 5000,
      lastPlayedAt: 9000,
      updatedAt: 9000,
      deviceId: LAPTOP,
    });
    const merged = bothWays((a, b) => mergeHistory(a, b, LWW), early, late);
    expect(merged.startedAt).toBe(1000);
    expect(merged.lastPlayedAt).toBe(9000);
    expect(merged.deviceId).toBe(LAPTOP);
  });

  it('keeps them even when the older row wins nothing else', () => {
    const a = history({ startedAt: 2000, lastPlayedAt: 8000, updatedAt: 8000 });
    const b = history({ startedAt: 1000, lastPlayedAt: 4000, updatedAt: 4000, deviceId: LAPTOP });
    const merged = bothWays((x, y) => mergeHistory(x, y, LWW), a, b);
    expect(merged.startedAt).toBe(1000);
    expect(merged.lastPlayedAt).toBe(8000);
    expect(merged.updatedAt).toBe(8000);
  });

  it('finished stays finished when a stale row without it arrives later', () => {
    const finished = history({ finishedAt: 7000, lastPlayedAt: 7000, updatedAt: 7000 });
    const stale = history({
      finishedAt: null,
      lastPlayedAt: 4000,
      updatedAt: 4000,
      deviceId: LAPTOP,
    });
    expect(bothWays((a, b) => mergeHistory(a, b, LWW), finished, stale).finishedAt).toBe(7000);
  });

  it('a newer entry with finishedAt cleared is a restart and wins', () => {
    const finished = history({ finishedAt: 7000, lastPlayedAt: 7000, updatedAt: 7000 });
    const restart = history({
      finishedAt: null,
      lastPlayedAt: 9000,
      updatedAt: 9000,
      deviceId: LAPTOP,
    });
    const merged = bothWays((a, b) => mergeHistory(a, b, LWW), finished, restart);
    expect(merged.finishedAt).toBeNull();
    expect(merged.lastPlayedAt).toBe(9000);
  });

  it('a newer finish beats an older open entry', () => {
    const open = history({ finishedAt: null, updatedAt: 3000 });
    const done = history({
      finishedAt: 8000,
      lastPlayedAt: 8000,
      updatedAt: 8000,
      deviceId: LAPTOP,
    });
    expect(bothWays((a, b) => mergeHistory(a, b, LWW), open, done).finishedAt).toBe(8000);
  });

  it('a tombstone wins when newer and loses to a newer play', () => {
    const live = history({ updatedAt: 2000 });
    const gone = history({ deletedAt: 3000, updatedAt: 3000, deviceId: LAPTOP });
    const played = history({ lastPlayedAt: 6000, updatedAt: 6000 });
    expect(bothWays((a, b) => mergeHistory(a, b, LWW), live, gone).deletedAt).toBe(3000);
    expect(bothWays((a, b) => mergeHistory(a, b, LWW), gone, played).deletedAt).toBeNull();
  });

  it('equal times: a live entry beats a tombstone', () => {
    const live = history({ updatedAt: 3000 });
    const gone = history({ deletedAt: 3000, updatedAt: 3000, deviceId: LAPTOP });
    expect(bothWays((a, b) => mergeHistory(a, b, LWW), live, gone).deletedAt).toBeNull();
  });

  it('first sign-in: finished is a union, even against a newer unfinished entry', () => {
    const finished = history({ finishedAt: 4000, lastPlayedAt: 4000, updatedAt: 4000 });
    const newerOpen = history({
      finishedAt: null,
      lastPlayedAt: 9000,
      updatedAt: 9000,
      deviceId: LAPTOP,
    });
    const merged = bothWays((a, b) => mergeHistory(a, b, FIRST_SIGN_IN), finished, newerOpen);
    expect(merged.finishedAt).toBe(4000);
    expect(merged.lastPlayedAt).toBe(9000);
    expect(merged.startedAt).toBe(1000);
  });

  it('first sign-in: two finishes keep the later one', () => {
    const a = history({ finishedAt: 4000, updatedAt: 4000 });
    const b = history({ finishedAt: 6000, updatedAt: 6000, deviceId: LAPTOP });
    expect(bothWays((x, y) => mergeHistory(x, y, FIRST_SIGN_IN), a, b).finishedAt).toBe(6000);
  });

  it('first sign-in: a live entry beats a tombstone', () => {
    const gone = history({ deletedAt: 9000, updatedAt: 9000 });
    const guest = history({ updatedAt: 1000, deviceId: LAPTOP });
    const merged = bothWays((a, b) => mergeHistory(a, b, FIRST_SIGN_IN), gone, guest);
    expect(merged.deletedAt).toBeNull();
  });
});

// ── Settings ───────────────────────────────────────────────────────────────────

describe('settings', () => {
  it('per key, the later write wins in both orders', () => {
    const older = setting({ value: 'dark', updatedAt: 1000 });
    const newer = setting({ value: 'light', updatedAt: 2000, deviceId: LAPTOP });
    expect(bothWays(mergeSetting, older, newer)).toEqual(newer);
  });

  it('equal times agree in both orders', () => {
    const a = setting({ value: 'dark', deviceId: PHONE });
    const b = setting({ value: 'light', deviceId: LAPTOP });
    expect([a, b]).toContainEqual(bothWays(mergeSetting, a, b));
  });

  it('the same device and time with different values still agree', () => {
    const a = setting({ value: 'dark' });
    const b = setting({ value: 'light' });
    bothWays(mergeSetting, a, b);
  });

  it('accepts every known key with an allowed value', () => {
    expect(validateSetting('theme', 'dark')).toEqual({ ok: true, value: 'dark' });
    expect(validateSetting('skipBackSeconds', 30)).toEqual({ ok: true, value: 30 });
    expect(validateSetting('skipForwardSeconds', 60)).toEqual({ ok: true, value: 60 });
    expect(validateSetting('autoRewind', false)).toEqual({ ok: true, value: false });
    expect(validateSetting('continueToNextChapter', true)).toEqual({ ok: true, value: true });
    expect(validateSetting('defaultSpeed', 1.25)).toEqual({ ok: true, value: 1.25 });
  });

  it('rejects an unknown key', () => {
    expect(validateSetting('volume', 11)).toEqual({ ok: false, reason: 'unknown_setting' });
    expect(validateSetting('constructor', 1)).toEqual({ ok: false, reason: 'unknown_setting' });
    expect(validateSetting('__proto__', 1)).toEqual({ ok: false, reason: 'unknown_setting' });
  });

  it('rejects a value that is not allowed for the key', () => {
    for (const [key, value] of [
      ['theme', 'purple'],
      ['theme', 1],
      ['skipBackSeconds', 20],
      ['skipForwardSeconds', '30'],
      ['autoRewind', 'yes'],
      ['defaultSpeed', 9],
      ['defaultSpeed', Number.NaN],
      ['continueToNextChapter', null],
    ] as const) {
      expect(validateSetting(key, value)).toEqual({ ok: false, reason: 'invalid_value' });
    }
  });
});

// ── Pushing a batch ────────────────────────────────────────────────────────────

const ctx = (o: Partial<PushContext> = {}): PushContext => ({
  deviceId: PHONE,
  clientNow: NOW,
  serverNow: NOW,
  merge: false,
  ...o,
});
const batch = (o: Partial<Batch> = {}): Batch => ({
  progress: [],
  flags: [],
  history: [],
  settings: [],
  ...o,
});
const progressItem = (o: Record<string, unknown> = {}) => ({
  bookId: BOOK,
  position: 100,
  duration: 1000,
  speed: 1,
  finished: false,
  updatedAt: NOW - 1000,
  ...o,
});

describe('planMerge', () => {
  it('inserts what the server does not have, stamped with the pushing device', () => {
    const plan = planMerge(emptyState(), batch({ progress: [progressItem()] }), ctx());
    expect(plan.progress).toHaveLength(1);
    expect(plan.progress[0]!.before).toBeUndefined();
    expect(plan.progress[0]!.after).toMatchObject({
      bookId: BOOK,
      position: 100,
      deviceId: PHONE,
      updatedAt: NOW - 1000,
      dismissedAt: null,
      deletedAt: null,
    });
  });

  it('snaps the speed to the player grid, so it survives a 4-byte float unchanged', () => {
    const speedOf = (speed: number) =>
      planMerge(emptyState(), batch({ progress: [progressItem({ speed })] }), ctx()).progress[0]!
        .after.speed;
    expect(speedOf(1.2345678)).toBe(1.25);
    expect(speedOf(1.1)).toBe(1.1);
    expect(Math.fround(speedOf(1.1))).not.toBe(1.1); // the raw float would not have matched
    expect(speedOf(2.9999)).toBe(3);
  });

  it('corrects every timestamp by the clock offset', () => {
    // The device clock runs 10 minutes slow.
    const c = ctx({ clientNow: NOW - 10 * MIN, serverNow: NOW });
    const plan = planMerge(
      emptyState(),
      batch({
        progress: [
          progressItem({ updatedAt: NOW - 10 * MIN - 2000, dismissedAt: NOW - 10 * MIN - 1000 }),
        ],
        flags: [
          {
            bookId: BOOK,
            kind: 'like',
            addedAt: NOW - 10 * MIN - 5000,
            updatedAt: NOW - 10 * MIN - 5000,
          },
        ],
        history: [
          {
            bookId: BOOK,
            startedAt: NOW - 10 * MIN - 9000,
            lastPlayedAt: NOW - 10 * MIN - 3000,
            finishedAt: NOW - 10 * MIN - 3000,
            updatedAt: NOW - 10 * MIN - 3000,
          },
        ],
        settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 10 * MIN - 4000 }],
      }),
      c,
    );
    expect(plan.progress[0]!.after.updatedAt).toBe(NOW - 2000);
    expect(plan.progress[0]!.after.dismissedAt).toBe(NOW - 1000);
    expect(plan.flags[0]!.after.addedAt).toBe(NOW - 5000);
    expect(plan.flags[0]!.after.updatedAt).toBe(NOW - 5000);
    expect(plan.history[0]!.after).toMatchObject({
      startedAt: NOW - 9000,
      lastPlayedAt: NOW - 3000,
      finishedAt: NOW - 3000,
    });
    expect(plan.settings[0]!.after.updatedAt).toBe(NOW - 4000);
  });

  it('a fast clock does not let a device win by writing "in the future"', () => {
    // The laptop's clock is 1 h fast. Its write, stamped 2 minutes before its own "now", really
    // happened 2 minutes ago, so the phone's write one second ago is newer. Uncorrected, the
    // laptop's raw time (almost an hour ahead) would have won.
    const fast = ctx({ deviceId: LAPTOP, clientNow: NOW + 60 * MIN, serverNow: NOW });
    const phone = applyBatch(
      emptyState(),
      batch({ progress: [progressItem({ position: 50, updatedAt: NOW - 1000 })] }),
      ctx(),
    ).state;
    const result = applyBatch(
      phone,
      batch({ progress: [progressItem({ position: 700, updatedAt: NOW + 60 * MIN - 120_000 })] }),
      fast,
    );
    expect(result.plan.progress).toHaveLength(0);
    expect(result.state.progress.get(BOOK)!.position).toBe(50);
  });

  it('a slow clock does not lose a write that really is the newest', () => {
    const slow = ctx({ deviceId: LAPTOP, clientNow: NOW - 60 * MIN, serverNow: NOW });
    const phone = applyBatch(
      emptyState(),
      batch({ progress: [progressItem({ position: 50, updatedAt: NOW - 120_000 })] }),
      ctx(),
    ).state;
    const result = applyBatch(
      phone,
      // Raw time is an hour in the past, corrected it is one second ago.
      batch({ progress: [progressItem({ position: 700, updatedAt: NOW - 60 * MIN - 1000 })] }),
      slow,
    ).state;
    expect(result.progress.get(BOOK)!.position).toBe(700);
    expect(result.progress.get(BOOK)!.updatedAt).toBe(NOW - 1000);
    expect(result.progress.get(BOOK)!.deviceId).toBe(LAPTOP);
  });

  it('clamps a timestamp more than five minutes in the future to server now', () => {
    const plan = planMerge(
      emptyState(),
      batch({ progress: [progressItem({ updatedAt: NOW + 3 * 60 * MIN })] }),
      ctx(),
    );
    expect(plan.progress[0]!.after.updatedAt).toBe(NOW);
  });

  it('a row that merges to what is stored is not a change', () => {
    const first = applyBatch(emptyState(), batch({ progress: [progressItem()] }), ctx());
    const older = batch({ progress: [progressItem({ position: 5, updatedAt: NOW - 5000 })] });
    const second = planMerge(first.state, older, ctx({ deviceId: LAPTOP }));
    expect(second.progress).toHaveLength(0);
  });

  it('pushing the same batch twice changes nothing the second time', () => {
    const b = batch({
      progress: [progressItem()],
      flags: [{ bookId: BOOK, kind: 'like', addedAt: NOW - 3000, updatedAt: NOW - 3000 }],
      history: [
        { bookId: BOOK, startedAt: NOW - 9000, lastPlayedAt: NOW - 2000, updatedAt: NOW - 2000 },
      ],
      settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 4000 }],
    });
    const once = applyBatch(emptyState(), b, ctx());
    expect(once.plan.progress.length + once.plan.flags.length).toBe(2);
    const twice = applyBatch(once.state, b, ctx());
    expect(twice.plan.progress).toHaveLength(0);
    expect(twice.plan.flags).toHaveLength(0);
    expect(twice.plan.history).toHaveLength(0);
    expect(twice.plan.settings).toHaveLength(0);
    expect(twice.state).toEqual(once.state);
  });

  it('a loser that only adds an earlier start is a change to the history row', () => {
    const stored = applyBatch(
      emptyState(),
      batch({
        history: [
          { bookId: BOOK, startedAt: NOW - 5000, lastPlayedAt: NOW - 1000, updatedAt: NOW - 1000 },
        ],
      }),
      ctx(),
    ).state;
    const plan = planMerge(
      stored,
      batch({
        history: [
          { bookId: BOOK, startedAt: NOW - 9000, lastPlayedAt: NOW - 8000, updatedAt: NOW - 8000 },
        ],
      }),
      ctx({ deviceId: LAPTOP }),
    );
    expect(plan.history).toHaveLength(1);
    expect(plan.history[0]!.after.startedAt).toBe(NOW - 9000);
    expect(plan.history[0]!.after.updatedAt).toBe(NOW - 1000);
    expect(plan.history[0]!.after.deviceId).toBe(PHONE);
  });

  it('merges duplicates inside one batch before comparing with the server', () => {
    const plan = planMerge(
      emptyState(),
      batch({
        progress: [
          progressItem({ position: 10, updatedAt: NOW - 3000 }),
          progressItem({ position: 30, updatedAt: NOW - 1000 }),
          progressItem({ position: 20, updatedAt: NOW - 2000 }),
        ],
      }),
      ctx(),
    );
    expect(plan.progress).toHaveLength(1);
    expect(plan.progress[0]!.after.position).toBe(30);
  });

  it('the merge flag makes the furthest position win', () => {
    const stored = applyBatch(
      emptyState(),
      batch({ progress: [progressItem({ position: 900, updatedAt: NOW - 60_000 })] }),
      ctx({ deviceId: LAPTOP }),
    ).state;
    const guest = batch({ progress: [progressItem({ position: 100, updatedAt: NOW - 1000 })] });
    expect(planMerge(stored, guest, ctx({ merge: false })).progress[0]!.after.position).toBe(100);
    expect(planMerge(stored, guest, ctx({ merge: true })).progress).toHaveLength(0);
  });

  it('settings: only allowed keys and values are stored; the rest are reported', () => {
    const plan = planMerge(
      emptyState(),
      batch({
        settings: [
          { key: 'theme', value: 'dark', updatedAt: NOW - 1000 },
          { key: 'theme2', value: 'dark', updatedAt: NOW - 1000 },
          { key: 'skipBackSeconds', value: 25, updatedAt: NOW - 1000 },
          { key: 'defaultSpeed', value: 1.5, updatedAt: NOW - 1000 },
        ],
      }),
      ctx(),
    );
    expect(plan.settings.map((c) => c.after.key).sort()).toEqual(['defaultSpeed', 'theme']);
    expect(plan.rejectedSettings).toEqual([
      { key: 'theme2', reason: 'unknown_setting' },
      { key: 'skipBackSeconds', reason: 'invalid_value' },
    ]);
  });

  it('a rejected setting does not overwrite a stored one', () => {
    const stored = applyBatch(
      emptyState(),
      batch({ settings: [{ key: 'theme', value: 'dark', updatedAt: NOW - 5000 }] }),
      ctx(),
    ).state;
    const plan = planMerge(
      stored,
      batch({ settings: [{ key: 'theme', value: 'neon', updatedAt: NOW - 1000 }] }),
      ctx({ deviceId: LAPTOP }),
    );
    expect(plan.settings).toHaveLength(0);
    expect(plan.rejectedSettings).toHaveLength(1);
  });

  it('a setting keeps its value in the normalised form', () => {
    const plan = planMerge(
      emptyState(),
      batch({ settings: [{ key: 'defaultSpeed', value: 1.2500001, updatedAt: NOW - 1000 }] }),
      ctx(),
    );
    expect(plan.settings[0]!.after.value).toBe(1.25);
  });
});

// ── Property test: any order, any grouping, the same state ────────────────────

/** A small seeded generator (mulberry32): the same rounds on every run. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(list: readonly T[]) => list[int(list.length)]!;
  const shuffle = <T>(list: readonly T[]) => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };
  return { next, int, pick, shuffle };
}

const BOOKS = [BOOK, BOOK2, '33333333-3333-4333-8333-333333333333'];
const DEVICES = [PHONE, LAPTOP, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const SETTING_CHOICES: [string, unknown[]][] = [
  ['theme', ['system', 'light', 'dark', 'neon']],
  ['skipBackSeconds', [10, 15, 30, 20]],
  ['autoRewind', [true, false]],
  ['mystery', [1]],
];

function randomBatch(r: ReturnType<typeof random>, merge: boolean): [Batch, PushContext] {
  const serverNow = 100_000 + r.int(50) * 1000;
  const offset = r.pick([0, 0, 2000, -3000, 400_000]);
  const clientNow = serverNow - offset;
  // Few distinct times, so equal timestamps happen all the time.
  const time = () => clientNow - r.int(8) * 1000 + (r.int(10) === 0 ? 10 * MIN : 0);
  const maybe = (p: number, v: () => number) => (r.next() < p ? v() : null);
  const list = <T>(make: () => T) => Array.from({ length: r.int(4) }, make);
  const b: Batch = {
    progress: list(() => ({
      bookId: r.pick(BOOKS),
      position: r.int(5) * 100,
      duration: 1000,
      speed: r.pick([1, 1.5]),
      finished: r.next() < 0.3,
      dismissedAt: maybe(0.2, time),
      deletedAt: maybe(0.2, time),
      updatedAt: time(),
    })),
    flags: list(() => ({
      bookId: r.pick(BOOKS),
      kind: r.pick(['like', 'listen_later'] as const),
      addedAt: time(),
      deletedAt: maybe(0.4, time),
      updatedAt: time(),
    })),
    history: list(() => {
      const startedAt = time();
      return {
        bookId: r.pick(BOOKS),
        startedAt,
        lastPlayedAt: startedAt + r.int(4) * 1000,
        finishedAt: maybe(0.3, time),
        deletedAt: maybe(0.2, time),
        updatedAt: time(),
      };
    }),
    settings: list(() => {
      const [key, values] = r.pick(SETTING_CHOICES);
      return { key, value: r.pick(values), updatedAt: time() };
    }),
  };
  return [b, { deviceId: r.pick(DEVICES), clientNow, serverNow, merge }];
}

function runSequence(batches: [Batch, PushContext][]): SyncState {
  let state = emptyState();
  for (const [b, c] of batches) state = applyBatch(state, b, c).state;
  return state;
}

describe.each([
  ['last write wins', false],
  ['first sign-in (merge: true)', true],
])('property: %s', (_name, merge) => {
  const ROUNDS = 300;

  it('batches in any order give the same state', () => {
    const r = random(merge ? 7 : 3);
    for (let round = 0; round < ROUNDS; round++) {
      const batches = Array.from({ length: 2 + r.int(4) }, () => randomBatch(r, merge));
      const expected = runSequence(batches);
      expect(runSequence(r.shuffle(batches))).toEqual(expected);
    }
  });

  it('the merge of two states is commutative and associative', () => {
    const r = random(merge ? 11 : 5);
    for (let round = 0; round < ROUNDS; round++) {
      const [a, b, c] = [0, 1, 2].map(() => runSequence([randomBatch(r, merge)]));
      const m = (x: SyncState, y: SyncState) => mergeStates(x, y, { merge });
      expect(m(a!, b!)).toEqual(m(b!, a!));
      expect(m(m(a!, b!), c!)).toEqual(m(a!, m(b!, c!)));
      expect(m(m(a!, b!), c!)).toEqual(m(c!, m(b!, a!)));
    }
  });

  it('grouping does not matter: merging states equals pushing the batches one by one', () => {
    const r = random(merge ? 13 : 17);
    for (let round = 0; round < ROUNDS; round++) {
      const batches = Array.from({ length: 2 + r.int(4) }, () => randomBatch(r, merge));
      const viaStates = batches
        .map(([b, c]) => runSequence([[b, c]]))
        .reduce((acc, s) => mergeStates(acc, s, { merge }), emptyState());
      expect(viaStates).toEqual(runSequence(batches));
    }
  });

  it('pushing everything a second time changes nothing', () => {
    const r = random(merge ? 19 : 23);
    for (let round = 0; round < ROUNDS; round++) {
      const batches = Array.from({ length: 1 + r.int(4) }, () => randomBatch(r, merge));
      const once = runSequence(batches);
      let state = once;
      for (const [b, c] of batches) {
        const { plan, state: next } = applyBatch(state, b, c);
        expect(plan.progress).toHaveLength(0);
        expect(plan.flags).toHaveLength(0);
        expect(plan.history).toHaveLength(0);
        expect(plan.settings).toHaveLength(0);
        state = next;
      }
      expect(state).toEqual(once);
    }
  });

  it('the items of one batch may come in any order', () => {
    const r = random(merge ? 29 : 31);
    for (let round = 0; round < ROUNDS; round++) {
      const [b, c] = randomBatch(r, merge);
      const shuffled: Batch = {
        progress: r.shuffle(b.progress),
        flags: r.shuffle(b.flags),
        history: r.shuffle(b.history),
        settings: r.shuffle(b.settings),
      };
      expect(runSequence([[shuffled, c]])).toEqual(runSequence([[b, c]]));
    }
  });
});
