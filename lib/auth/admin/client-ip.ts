import { createHmac } from 'node:crypto';

const MAX_ADDRESS_LENGTH = 64;

function usable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= MAX_ADDRESS_LENGTH ? trimmed : null;
}

/**
 * The caller's address as Vercel reports it. Vercel sets these headers itself and overwrites
 * any value the client sends, so they can be trusted there. Without one (local runs) every
 * caller shares the "unknown" bucket.
 */
export function clientIp(headers: Headers): string {
  return (
    usable(headers.get('x-real-ip')) ??
    usable(headers.get('x-forwarded-for')?.split(',')[0]) ??
    'unknown'
  );
}

/** What is stored for an address: a keyed hash, so the table never holds an IP. */
export function attemptKey(ip: string, secret: string): string {
  return `ip:${createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)}`;
}
