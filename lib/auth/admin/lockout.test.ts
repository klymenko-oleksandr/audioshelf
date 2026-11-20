import { describe, expect, it } from 'vitest';
import { LOCK_MS, MAX_ATTEMPTS, reserveAttempt, type AttemptState } from './lockout';

const NOW = new Date('2026-11-20T10:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const fresh: AttemptState = { failedCount: 0, lastAttemptAt: null, lockedUntil: null };

/** Runs `n` attempts one after another, one minute apart, all wrong. */
function failTimes(n: number, start: AttemptState = fresh) {
  let state = start;
  const results = [];
  for (let i = 0; i < n; i += 1) {
    const result = reserveAttempt(state, at(i * MIN));
    results.push(result);
    state = result.next;
  }
  return { state, results };
}

describe('reserveAttempt (per-IP lockout policy)', () => {
  it('allows 5 attempts, counting down the attempts left', () => {
    expect(MAX_ATTEMPTS).toBe(5);
    const { results } = failTimes(5);
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(results.map((r) => (r.allowed ? r.attemptsLeft : null))).toEqual([4, 3, 2, 1, 0]);
  });

  it('locks for 15 minutes right after the 5th attempt and refuses the 6th', () => {
    const { state } = failTimes(5);
    expect(LOCK_MS).toBe(15 * MIN);
    // The 5th attempt happened at minute 4.
    expect(state.lockedUntil).toEqual(at(4 * MIN + LOCK_MS));
    const sixth = reserveAttempt(state, at(5 * MIN));
    expect(sixth.allowed).toBe(false);
    expect(sixth).toMatchObject({ allowed: false, retryAfterSeconds: 14 * 60 });
  });

  it('does not extend the lock or the count while locked', () => {
    const { state } = failTimes(5);
    const refused = reserveAttempt(state, at(6 * MIN));
    expect(refused.next).toEqual(state);
  });

  it('starts counting again once the lock has expired', () => {
    const { state } = failTimes(5);
    const after = reserveAttempt(state, at(4 * MIN + LOCK_MS + 1));
    expect(after).toMatchObject({ allowed: true, attemptsLeft: 4 });
    expect(after.next).toMatchObject({ failedCount: 1, lockedUntil: null });
  });

  it('forgets old failures: a slow trickle never locks', () => {
    // One wrong password every 20 minutes for a day.
    let state = fresh;
    for (let i = 0; i < 72; i += 1) {
      const result = reserveAttempt(state, at(i * 20 * MIN));
      expect(result.allowed).toBe(true);
      state = result.next;
    }
    expect(state.failedCount).toBe(1);
  });

  it('keeps counting failures that are close together', () => {
    const first = reserveAttempt(fresh, NOW);
    const second = reserveAttempt(first.next, at(14 * MIN));
    expect(second).toMatchObject({ allowed: true, attemptsLeft: 3 });
  });
});
