/**
 * Lockout policy for the admin login (ADR 5), per client address: five wrong passwords lock
 * that address for 15 minutes. Other addresses are never affected, so a stranger's guesses
 * cannot lock the owner out. Pure functions; the database side is in `attempts.ts`.
 */
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
/** Failures further apart than this are forgotten. */
const WINDOW_MS = LOCK_MS;

export interface AttemptState {
  failedCount: number;
  lastAttemptAt: Date | null;
  lockedUntil: Date | null;
}

export type Reservation =
  | { allowed: true; attemptsLeft: number; next: AttemptState }
  | { allowed: false; retryAfterSeconds: number; next: AttemptState };

/**
 * Takes one attempt *before* the password is checked, so a burst of parallel guesses cannot
 * all get through: the count is already up by the time the next request looks. A correct
 * password clears the count afterwards.
 *
 * The fifth attempt is still checked; if it is wrong the lock starts right away.
 */
export function reserveAttempt(state: AttemptState, now: Date): Reservation {
  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000),
      next: state,
    };
  }

  const stale =
    state.lockedUntil !== null ||
    state.lastAttemptAt === null ||
    now.getTime() - state.lastAttemptAt.getTime() >= WINDOW_MS;
  const failedCount = (stale ? 0 : state.failedCount) + 1;
  const lockedUntil = failedCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MS) : null;

  return {
    allowed: true,
    attemptsLeft: MAX_ATTEMPTS - failedCount,
    next: { failedCount, lastAttemptAt: now, lockedUntil },
  };
}
