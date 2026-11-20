import { jwtVerify, SignJWT } from 'jose';

/** Separate from the listener's cookies (ADR 5). */
export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

export interface AdminSession {
  /** Always "owner" for now; per-admin logins can fill this in later (ADR 5). */
  adminId: string;
  expiresAt: Date;
}

const SECRET_PROBLEM = `ADMIN_SESSION_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters.`;

function key(secret: string | undefined): Uint8Array | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return new TextEncoder().encode(secret);
}

/** True when the secret is usable; the login refuses to sign anyone in otherwise. */
export const isSessionSecretValid = (secret: string | undefined) => key(secret) !== null;

export async function createSessionToken(
  secret: string | undefined,
  now: Date = new Date(),
): Promise<string> {
  const signingKey = key(secret);
  if (!signingKey) throw new Error(SECRET_PROBLEM);
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ admin_id: 'owner' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ADMIN_SESSION_SECONDS)
    .sign(signingKey);
}

/** The session behind a token, or null for anything that is not a valid, unexpired one. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<AdminSession | null> {
  const verifyingKey = key(secret);
  if (!token || !verifyingKey) return null;
  try {
    const { payload } = await jwtVerify(token, verifyingKey, {
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (payload.admin_id !== 'owner' || typeof payload.exp !== 'number') return null;
    return { adminId: payload.admin_id, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}

/**
 * No `maxAge`/`expires`: the browser drops the cookie when it closes, and the token's own `exp`
 * ends the session after 12 hours either way (ADR 5). `secure` is off only for plain-http
 * development.
 */
export const adminCookieOptions = (secure: boolean) =>
  ({ httpOnly: true, secure, sameSite: 'lax', path: '/' }) as const;
