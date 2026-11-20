import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

/** A shorter password is refused at login whatever the stored hash says. */
export const MIN_PASSWORD_LENGTH = 8;
/** Longer input is refused before hashing, so it cannot be used to burn server time. */
const MAX_PASSWORD_LENGTH = 256;
const KEY_LENGTH = 64;
const MIN_SALT_BYTES = 8;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface ParsedPasswordHash {
  salt: Buffer;
  hash: Buffer;
}

/**
 * `ADMIN_PASSWORD_HASH` is `scrypt.<salt>.<hash>`, both base64url, made by the one-line command
 * in `.env.example` (Node's built-in scrypt with its default cost, 64-byte key). The dots keep
 * the value safe in `.env` files and Vercel, where `$` would be expanded.
 */
export function parsePasswordHash(stored: string | undefined): ParsedPasswordHash | null {
  if (!stored) return null;
  const parts = stored.split('.');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return null;
  const [, saltPart, hashPart] = parts as [string, string, string];
  if (!BASE64URL.test(saltPart) || !BASE64URL.test(hashPart)) return null;
  const salt = Buffer.from(saltPart, 'base64url');
  const hash = Buffer.from(hashPart, 'base64url');
  if (salt.length < MIN_SALT_BYTES || hash.length !== KEY_LENGTH) return null;
  return { salt, hash };
}

/**
 * Checks a typed password against the stored hash in constant time. Never throws: anything
 * wrong with the input or the stored value is simply "no".
 */
export async function verifyPassword(
  password: string,
  stored: string | undefined,
): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) return false;
  // NFKC so the same text typed on another keyboard or OS compares equal.
  const normalized = password.normalize('NFKC');
  if (normalized.length < MIN_PASSWORD_LENGTH) return false;
  const actual = await scryptAsync(normalized, parsed.salt, KEY_LENGTH);
  return timingSafeEqual(actual, parsed.hash);
}
