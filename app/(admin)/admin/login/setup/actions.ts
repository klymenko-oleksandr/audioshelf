'use server';

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { cookies, headers } from 'next/headers';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_SECONDS,
  createChallengeToken,
  verifyChallengeToken,
} from '@/lib/auth/admin/challenge';
import { parsePasskeys, readPasskeys, serializePasskey } from '@/lib/auth/admin/passkeys';
import { relyingParty } from '@/lib/auth/admin/relying-party';
import { isSessionSecretValid } from '@/lib/auth/admin/session';
import { isSetupTokenValid } from '@/lib/auth/admin/setup-token';

export type BeginSetupResult =
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false; error: 'bad_token' | 'misconfigured' };

export type FinishSetupResult =
  | { ok: true; entry: string }
  | { ok: false; error: 'bad_token' | 'rejected' | 'expired' | 'misconfigured' };

// A fixed id for the one owner: every passkey made here belongs to the same account.
const USER_ID = new TextEncoder().encode('audioshelf-admin-owner');

/** Step 1 of adding a passkey. Only works while `ADMIN_SETUP_TOKEN` is set, and only with that token. */
export async function beginPasskeySetup(token: string): Promise<BeginSetupResult> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const rp = relyingParty(await headers());
  if (!isSessionSecretValid(secret) || !rp) return { ok: false, error: 'misconfigured' };
  if (!isSetupTokenValid(token, process.env.ADMIN_SETUP_TOKEN)) {
    return { ok: false, error: 'bad_token' };
  }

  const options = await generateRegistrationOptions({
    rpName: 'Audioshelf admin',
    rpID: rp.rpID,
    userName: 'owner',
    userID: USER_ID,
    attestationType: 'none',
    excludeCredentials: readPasskeys().map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  const store = await cookies();
  store.set(CHALLENGE_COOKIE, await createChallengeToken(secret, 'setup', options.challenge), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CHALLENGE_SECONDS,
  });
  return { ok: true, options };
}

/**
 * Step 2: check the new passkey and hand back the JSON entry to add to `ADMIN_PASSKEYS`.
 * Nothing is saved here: changing the variable (and redeploying) is what makes it count.
 */
export async function finishPasskeySetup(
  token: string,
  response: RegistrationResponseJSON,
  label: string,
): Promise<FinishSetupResult> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const rp = relyingParty(await headers());
  if (!isSessionSecretValid(secret) || !rp) return { ok: false, error: 'misconfigured' };
  if (!isSetupTokenValid(token, process.env.ADMIN_SETUP_TOKEN)) {
    return { ok: false, error: 'bad_token' };
  }

  const store = await cookies();
  const challenge = await verifyChallengeToken(store.get(CHALLENGE_COOKIE)?.value, secret, 'setup');
  store.delete(CHALLENGE_COOKIE);
  if (!challenge) return { ok: false, error: 'expired' };

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified) return { ok: false, error: 'rejected' };
    const { credential } = verification.registrationInfo;
    // Through the same reader the login uses, so what is printed is what the login accepts.
    const [passkey] = parsePasskeys(
      JSON.stringify([
        {
          id: credential.id,
          publicKey: isoBase64URL.fromBuffer(credential.publicKey),
          transports: credential.transports,
          label: label.trim() || undefined,
        },
      ]),
    );
    if (!passkey) return { ok: false, error: 'rejected' };
    const entry = serializePasskey(passkey);
    return { ok: true, entry };
  } catch {
    return { ok: false, error: 'rejected' };
  }
}
