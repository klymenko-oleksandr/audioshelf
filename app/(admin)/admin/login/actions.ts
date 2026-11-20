'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { attemptLogin, readLoginEnv } from '@/lib/auth/admin/login';
import { LOGIN_PATH, safeNextPath } from '@/lib/auth/admin/redirect';
import { ADMIN_SESSION_COOKIE, adminCookieOptions } from '@/lib/auth/admin/session';
import { getDb } from '@/lib/db';

export type LoginFormState =
  | { error: null }
  | { error: 'wrong'; attemptsLeft: number }
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
    result = await attemptLogin({
      db: getDb(),
      headers: await headers(),
      password: typeof password === 'string' ? password : '',
      env: readLoginEnv(),
    });
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
