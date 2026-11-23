import { NextResponse, type NextRequest } from 'next/server';
import { isImportRequestAuthorised } from '@/lib/auth/admin/import-token';
import { DEFAULT_ADMIN_PATH, loginHref, LOGIN_PATH } from '@/lib/auth/admin/redirect';
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '@/lib/auth/admin/session';

/**
 * The first gate of the admin panel (ADR 5): every `/admin` page and `/api/admin` route needs a
 * valid session cookie, checked before any page code runs. Pages and handlers check again
 * (`lib/auth/admin/guard.ts`), so a mistake in this matcher cannot open the panel.
 *
 * The one exception is the content import (`/api/admin/import` and below, Phase 4e): a script
 * calls it, so it is guarded by a bearer token (`ADMIN_IMPORT_TOKEN`), checked on every request,
 * and a session cookie does not open it. The token opens nothing else.
 *
 * Every response from these paths is also marked private (never stored by a browser, CDN or
 * proxy) and unindexable.
 */
const IMPORT_PATH = '/api/admin/import';
const isImportPath = (pathname: string) =>
  pathname === IMPORT_PATH || pathname.startsWith(`${IMPORT_PATH}/`);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isImportPath(pathname)) {
    const response = isImportRequestAuthorised(request.headers)
      ? NextResponse.next()
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return markPrivate(response);
  }

  const session = await verifySessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );

  let response: NextResponse | undefined;
  if (pathname.startsWith('/api/admin')) {
    if (!session) response = NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  } else if (pathname.startsWith(`${LOGIN_PATH}/`)) {
    // /admin/login/setup: adding a passkey, protected by its own one-time token, not by a session.
  } else if (pathname === LOGIN_PATH) {
    if (session) response = NextResponse.redirect(new URL(DEFAULT_ADMIN_PATH, request.url));
  } else if (!session) {
    response = NextResponse.redirect(new URL(loginHref(pathname, search), request.url));
  }

  return markPrivate(response ?? NextResponse.next());
}

function markPrivate(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.append('Vary', 'Cookie');
  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
