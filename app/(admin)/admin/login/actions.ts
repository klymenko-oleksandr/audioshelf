'use server';

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_SECONDS,
  createChallengeToken,
  verifyChallengeToken,
} from '@/lib/auth/admin/challenge';
import { findPasskey, readPasskeys } from '@/lib/auth/admin/passkeys';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/admin/redirect';
import { relyingParty } from '@/lib/auth/admin/relying-party';
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  createSessionToken,
  isSessionSecretValid,
} from '@/lib/auth/admin/session';

export type BeginLoginResult =
  | { ok: true; options: PublicKeyCredentialRequestOptionsJSON }
  | { ok: false; error: 'misconfigured' };

export type FinishLoginResult =
  { ok: true; next: string } | { ok: false; error: 'rejected' | 'expired' | 'misconfigured' };

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Step 1 of signing in (ADR 5): a fresh challenge for the registered passkeys. Nothing is read
 * from or written to the database, and nothing is stored on the server: the challenge goes
 * back in a short-lived signed cookie.
 */
export async function beginPasskeyLogin(): Promise<BeginLoginResult> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const passkeys = readPasskeys();
  const rp = relyingParty(await headers());
  if (!isSessionSecretValid(secret) || passkeys.length === 0 || !rp) {
    return { ok: false, error: 'misconfigured' };
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    userVerification: 'required',
  });
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, await createChallengeToken(secret, 'login', options.challenge), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: CHALLENGE_SECONDS,
  });
  return { ok: true, options };
}

/** Step 2: check the signed answer; on success start the 12 h session. */
export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON,
  next: string,
): Promise<FinishLoginResult> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const passkeys = readPasskeys();
  const rp = relyingParty(await headers());
  if (!isSessionSecretValid(secret) || passkeys.length === 0 || !rp) {
    return { ok: false, error: 'misconfigured' };
  }

  const store = await cookies();
  const challenge = await verifyChallengeToken(store.get(CHALLENGE_COOKIE)?.value, secret, 'login');
  store.delete(CHALLENGE_COOKIE); // one challenge, one answer
  if (!challenge) return { ok: false, error: 'expired' };

  const passkey = findPasskey(passkeys, response?.id ?? '');
  if (!passkey) return { ok: false, error: 'rejected' };

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      // The counter cannot be kept without a database, and synced passkeys do not count anyway.
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: 0,
        transports: passkey.transports,
      },
    });
    if (!verification.verified) return { ok: false, error: 'rejected' };
  } catch {
    return { ok: false, error: 'rejected' };
  }

  store.set(
    ADMIN_SESSION_COOKIE,
    await createSessionToken(secret),
    adminCookieOptions(isProduction()),
  );
  return { ok: true, next: safeNextPath(next) };
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect(LOGIN_PATH);
}
