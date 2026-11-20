import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { LOGIN_PATH } from './redirect';
import { ADMIN_SESSION_COOKIE, verifySessionToken, type AdminSession } from './session';

/** The admin session of the current request, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySessionToken(
    store.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

/**
 * For admin pages and layouts: the session, or a redirect to the login page. `proxy.ts` has
 * already checked; this is the second lock, so no admin page depends on the matcher alone.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect(LOGIN_PATH);
  return session;
}

/**
 * For admin route handlers (`/api/admin/*`) and server actions: start with
 *
 *     const denied = await denyUnlessAdmin();
 *     if (denied) return denied;
 */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  return (await getAdminSession())
    ? null
    : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
