import { timingSafeEqual } from 'node:crypto';

const MIN_TOKEN_LENGTH = 32;

/** Passkey setup exists only while `ADMIN_SETUP_TOKEN` is set to something long enough to be unguessable. */
export const isSetupEnabled = (configured: string | undefined): configured is string =>
  typeof configured === 'string' && configured.length >= MIN_TOKEN_LENGTH;

export function isSetupTokenValid(provided: string | undefined, configured: string | undefined) {
  if (!isSetupEnabled(configured) || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}
