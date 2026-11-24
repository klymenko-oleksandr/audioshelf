export type SigninError = 'cancelled' | 'failed';

/** The reason the page was opened with, from `?error=` (anything else is ignored). */
export function parseSigninError(raw: string | string[] | undefined): SigninError | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'cancelled' || value === 'failed' ? value : null;
}
