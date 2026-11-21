const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

const first = (value: string | null) => value?.split(',')[0]?.trim() || null;

/**
 * Who the passkey is for: the site's own host. A passkey signs the origin the browser really
 * saw, so a forged Host header cannot make someone else's passkey work here.
 */
export function relyingParty(headers: Headers): { rpID: string; origin: string } | null {
  const host = first(headers.get('x-forwarded-host')) ?? first(headers.get('host'));
  if (!host || !HOST.test(host)) return null;
  const rpID = host.replace(/:\d+$/, '');
  const proto =
    first(headers.get('x-forwarded-proto')) ?? (rpID === 'localhost' ? 'http' : 'https');
  return { rpID, origin: `${proto}://${host}` };
}
