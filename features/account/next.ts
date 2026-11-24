/**
 * Where to go after signing in (PRD: Google sign-in → `next`). The value comes from a URL, so
 * it is untrusted: only an in-app path is accepted, never another site (open redirect), and
 * never the sign-in pages themselves (a loop) or the admin panel (separate login).
 */

const MAX_LENGTH = 2000;
const CONTROL = /[\u0000-\u001f\u007f]/;

const BLOCKED_PREFIXES = ['/signin', '/auth', '/admin', '/api/admin'];

function blocked(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? path;
  return BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** An in-app path from `raw`, or `fallback` when it is missing or not safe. */
export function safeNextPath(raw: string | string[] | null | undefined, fallback = '/'): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value === '') return fallback;
  if (value.length > MAX_LENGTH || CONTROL.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  if (blocked(value)) return fallback;
  return value;
}

/** The URL Google (through Supabase) sends the browser back to. */
export function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}
