import { safeNextPath } from './next';

export type ExchangeCode = (code: string) => Promise<{ error: unknown }>;

function signinWith(origin: string, error: 'cancelled' | 'failed', next: string): string {
  const params = new URLSearchParams({ error });
  if (next !== '/') params.set('next', next);
  return `${origin}/signin?${params.toString()}`;
}

/**
 * Where the browser goes after Google: the page it started from when the sign-in worked, the
 * sign-in page with a reason when it did not. Never throws. `exchange` turns the one-time code
 * into a session (cookies); it is a parameter so the rules can be tested.
 */
export async function resolveCallback(requestUrl: string, exchange: ExchangeCode): Promise<string> {
  const url = new URL(requestUrl);
  const origin = url.origin;
  const next = safeNextPath(url.searchParams.get('next'));

  const providerError = url.searchParams.get('error');
  if (providerError) {
    return signinWith(origin, providerError === 'access_denied' ? 'cancelled' : 'failed', next);
  }

  const code = url.searchParams.get('code');
  if (!code) return signinWith(origin, 'failed', next);

  try {
    const { error } = await exchange(code);
    if (error) return signinWith(origin, 'failed', next);
  } catch {
    return signinWith(origin, 'failed', next);
  }
  return `${origin}${next}`;
}
