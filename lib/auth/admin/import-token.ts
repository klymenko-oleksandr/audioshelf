import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The token that guards `/api/admin/import*` (Phase 4e). The content pipeline sends it as
 * `Authorization: Bearer <token>`; there is no session and no cookie involved, so the import
 * can be driven from a script and a browser session can never reach it by accident.
 *
 * The import exists only while `ADMIN_IMPORT_TOKEN` holds at least 32 characters.
 */
export const IMPORT_TOKEN_ENV = 'ADMIN_IMPORT_TOKEN';
export const MIN_IMPORT_TOKEN_LENGTH = 32;

export const isImportEnabled = (configured: string | undefined): configured is string =>
  typeof configured === 'string' && configured.length >= MIN_IMPORT_TOKEN_LENGTH;

/** The token from `Authorization: Bearer <token>`, or undefined for anything else. */
export function bearerToken(header: string | null | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^bearer +(\S+)$/i.exec(header.trim());
  return match?.[1];
}

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/**
 * Constant-time check. Both sides are hashed first, so the comparison always works on 32 bytes
 * and neither the content nor the length of the real token can be learned from timing.
 */
export function isImportTokenValid(
  provided: string | undefined,
  configured: string | undefined,
): boolean {
  if (!isImportEnabled(configured) || typeof provided !== 'string') return false;
  return timingSafeEqual(digest(provided), digest(configured));
}

/** Checks a request's headers. Run on every request, by `proxy.ts` and again by the handlers. */
export function isImportRequestAuthorised(
  headers: Headers,
  configured: string | undefined = process.env[IMPORT_TOKEN_ENV],
): boolean {
  return isImportTokenValid(bearerToken(headers.get('authorization')), configured);
}
