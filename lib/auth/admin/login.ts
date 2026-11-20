import { clearAttempts, purgeOldAttempts, reserveLoginAttempt, type AuthDb } from './attempts';
import { attemptKey, clientIp } from './client-ip';
import { parsePasswordHash, verifyPassword } from './password';
import { createSessionToken, isSessionSecretValid } from './session';

export interface LoginEnv {
  /** `ADMIN_PASSWORD_HASH` */
  passwordHash: string | undefined;
  /** `ADMIN_SESSION_SECRET` */
  sessionSecret: string | undefined;
}

export type LoginResult =
  | { status: 'ok'; token: string }
  | { status: 'wrong'; attemptsLeft: number }
  | { status: 'locked'; retryAfterSeconds: number }
  /** The server's environment is wrong; nobody can sign in until it is fixed. */
  | { status: 'misconfigured' };

export const readLoginEnv = (): LoginEnv => ({
  passwordHash: process.env.ADMIN_PASSWORD_HASH,
  sessionSecret: process.env.ADMIN_SESSION_SECRET,
});

/**
 * One login attempt, start to finish (ADR 5): count it for the caller's address, refuse if
 * that address is locked, check the password, and on success hand back a 12 h session token.
 */
export async function attemptLogin(input: {
  db: AuthDb;
  headers: Headers;
  password: string;
  env: LoginEnv;
  now?: Date;
}): Promise<LoginResult> {
  const { db, headers, password, env } = input;
  const now = input.now ?? new Date();

  if (!parsePasswordHash(env.passwordHash) || !isSessionSecretValid(env.sessionSecret)) {
    return { status: 'misconfigured' };
  }

  const key = attemptKey(clientIp(headers), env.sessionSecret!);
  const reservation = await reserveLoginAttempt(db, key, now);
  if (!reservation.allowed) {
    return { status: 'locked', retryAfterSeconds: reservation.retryAfterSeconds };
  }

  if (await verifyPassword(password, env.passwordHash)) {
    await clearAttempts(db, key);
    return { status: 'ok', token: await createSessionToken(env.sessionSecret, now) };
  }

  // Housekeeping must never turn a wrong password into a server error.
  await purgeOldAttempts(db, now).catch(() => undefined);

  const { lockedUntil } = reservation.next;
  if (lockedUntil) {
    return {
      status: 'locked',
      retryAfterSeconds: Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000),
    };
  }
  return { status: 'wrong', attemptsLeft: reservation.attemptsLeft };
}
