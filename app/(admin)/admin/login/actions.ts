'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { attemptLogin, readLoginEnv } from '@/lib/auth/admin/login';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/admin/redirect';
import { ADMIN_SESSION_COOKIE, adminCookieOptions } from '@/lib/auth/admin/session';
import { getDb } from '@/lib/db';
import { withTimeout } from '@/lib/with-timeout';

export type LoginFormState =
  | { error: null }
  | { error: 'wrong'; attemptsLeft: number }
  | { error: 'too_short' }
  | { error: 'locked'; retryAfterSeconds: number }
  | { error: 'unavailable' }
  | { error: 'misconfigured' };

export async function signIn(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const password = formData.get('password');
  const next = safeNextPath(String(formData.get('next') ?? ''));

  let result;
  try {
    // A hung database call must end as an error the form can show, not as a 5-minute spinner.
    result = await withTimeout(
      attemptLogin({
        db: getDb(),
        headers: await headers(),
        password: typeof password === 'string' ? password : '',
        env: readLoginEnv(),
      }),
      15_000,
      'Admin sign-in',
    );
  } catch (error) {
    console.error('Admin sign-in failed', error);
    return { error: 'unavailable' };
  }

  switch (result.status) {
    case 'ok': {
      const store = await cookies();
      store.set(
        ADMIN_SESSION_COOKIE,
        result.token,
        adminCookieOptions(process.env.NODE_ENV === 'production'),
      );
      redirect(next);
    }
    case 'wrong':
      return { error: 'wrong', attemptsLeft: result.attemptsLeft };
    case 'too_short':
      return { error: 'too_short' };
    case 'locked':
      return { error: 'locked', retryAfterSeconds: result.retryAfterSeconds };
    case 'misconfigured':
      return { error: 'misconfigured' };
  }
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect(LOGIN_PATH);
}
