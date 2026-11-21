import type { AuthenticatorTransport } from '@simplewebauthn/server';

/**
 * One registered passkey. The public key is not a secret, so the list lives in the
 * `ADMIN_PASSKEYS` environment variable and signing in needs no database (ADR 5).
 */
export interface Passkey {
  /** Credential id, base64url. */
  id: string;
  /** COSE public key, base64url. */
  publicKey: string;
  transports?: AuthenticatorTransport[];
  label?: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const TRANSPORTS = new Set(['ble', 'hybrid', 'internal', 'nfc', 'usb']);
const MAX_LABEL = 60;

function parseEntry(value: unknown): Passkey | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, publicKey, transports, label } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !BASE64URL.test(id)) return null;
  if (typeof publicKey !== 'string' || !BASE64URL.test(publicKey)) return null;
  const entry: Passkey = { id, publicKey };
  if (Array.isArray(transports)) {
    const known = transports.filter(
      (t): t is AuthenticatorTransport => typeof t === 'string' && TRANSPORTS.has(t),
    );
    if (known.length > 0) entry.transports = known;
  }
  if (typeof label === 'string' && label.trim()) entry.label = label.trim().slice(0, MAX_LABEL);
  return entry;
}

/** The passkeys in `ADMIN_PASSKEYS`. Anything unusable is skipped; a broken variable means no passkeys. */
export function parsePasskeys(raw: string | undefined): Passkey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEntry).filter((entry): entry is Passkey => entry !== null);
  } catch {
    return [];
  }
}

export const findPasskey = (passkeys: Passkey[], id: string) => passkeys.find((p) => p.id === id);

/** One compact JSON object, ready to be added to the `ADMIN_PASSKEYS` array. */
export const serializePasskey = (passkey: Passkey) => JSON.stringify(passkey);

export const readPasskeys = () => parsePasskeys(process.env.ADMIN_PASSKEYS);
