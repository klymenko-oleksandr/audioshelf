import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { Page } from '@playwright/test';

/**
 * Admin credentials for the end-to-end run. The admin signs in with a passkey, so the tests
 * use one fixed key pair: the public half is passed to the server Playwright starts
 * (`ADMIN_PASSKEYS`, see playwright.config.ts) and the private half goes into a virtual
 * authenticator in the browser. Fixed values keep a server left running from an earlier run
 * accepting it.
 */
export const ADMIN_SESSION_SECRET = 'e2e-session-secret-0123456789-abcdefghijklmnop';
export const ADMIN_SETUP_TOKEN = 'e2e-setup-token-0123456789-abcdefghijklmnop';

// Test-only P-256 keys. Never used anywhere else.
const OWNER_PRIVATE_KEY =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg30Otzl4fpVjKIL+yipwnVzMLURqiS25VZXwb8QC6vJehRANCAAS2KvrV2zSL1958nRKEMb4aycPsRMgMgaICjrbqYDwnUenqj4D5D0/akOU6d6RGfEfO/sNe8Wai2bGTyiThN6tV';
const STRANGER_PRIVATE_KEY =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgRHmyby3gBDXB/Sgax5UapCdLOpKzGTojjevG7k+HIMyhRANCAAQaAxlyeSpyucJcF4GKfXce8coT3keOANO86MvIMvC02Liq4uzTDkr2v2M7VMSF37/UEG8UKv868KHIKWZnG7AO';

const CREDENTIAL_ID = Buffer.from('e2e-admin-passkey').toString('base64url');

/** The COSE (ES256) form of a key's public half: what WebAuthn servers store. */
function coseEs256PublicKey(privateKeyDer: string): string {
  const jwk = createPublicKey(
    createPrivateKey({ key: Buffer.from(privateKeyDer, 'base64'), format: 'der', type: 'pkcs8' }),
  ).export({ format: 'jwk' });
  const x = Buffer.from(jwk.x as string, 'base64url');
  const y = Buffer.from(jwk.y as string, 'base64url');
  // CBOR map {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]).toString('base64url');
}

/** The value of `ADMIN_PASSKEYS` for the e2e server. */
export const ADMIN_PASSKEYS = JSON.stringify([
  { id: CREDENTIAL_ID, publicKey: coseEs256PublicKey(OWNER_PRIVATE_KEY), transports: ['internal'] },
]);

/**
 * Gives this page a virtual authenticator holding the owner's passkey (or, with
 * `whose: 'stranger'`, a passkey with the same id but a different private key, which the
 * server must refuse).
 */
export async function addVirtualPasskey(page: Page, whose: 'owner' | 'stranger' = 'owner') {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await cdp.send('WebAuthn.addCredential', {
    authenticatorId,
    credential: {
      credentialId: Buffer.from('e2e-admin-passkey').toString('base64'),
      isResidentCredential: true,
      rpId: 'localhost',
      privateKey: whose === 'owner' ? OWNER_PRIVATE_KEY : STRANGER_PRIVATE_KEY,
      userHandle: Buffer.from('audioshelf-admin-owner').toString('base64'),
      signCount: 0,
    },
  });
  return cdp;
}

/** Opens the login page and signs in with the owner's passkey. */
export async function signInWithPasskey(page: Page, from = '/admin/login') {
  await addVirtualPasskey(page);
  await page.goto(from);
  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
}
