import { jwtVerify, SignJWT } from 'jose';

export type ChallengePurpose = 'login' | 'setup';

export const CHALLENGE_COOKIE = 'admin_challenge';
export const CHALLENGE_SECONDS = 5 * 60;
const AUDIENCE = 'admin-passkey-challenge';

const key = (secret: string | undefined) =>
  secret && secret.length >= 32 ? new TextEncoder().encode(secret) : null;

/**
 * The server remembers nothing between "here is a challenge" and "here is the signed answer":
 * the challenge travels in a short-lived signed cookie. The audience keeps it from being used
 * as a session (and the other way round).
 */
export async function createChallengeToken(
  secret: string | undefined,
  purpose: ChallengePurpose,
  challenge: string,
  now: Date = new Date(),
): Promise<string> {
  const signingKey = key(secret);
  if (!signingKey) throw new Error('ADMIN_SESSION_SECRET must be set to at least 32 characters.');
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ challenge, purpose })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + CHALLENGE_SECONDS)
    .sign(signingKey);
}

/** The challenge inside a token made for `purpose`, or null. */
export async function verifyChallengeToken(
  token: string | undefined,
  secret: string | undefined,
  purpose: ChallengePurpose,
  now: Date = new Date(),
): Promise<string | null> {
  const verifyingKey = key(secret);
  if (!token || !verifyingKey) return null;
  try {
    const { payload } = await jwtVerify(token, verifyingKey, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
      currentDate: now,
    });
    if (payload.purpose !== purpose || typeof payload.challenge !== 'string') return null;
    return payload.challenge;
  } catch {
    return null;
  }
}
