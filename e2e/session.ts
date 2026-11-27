import type { Page } from '@playwright/test';

// A faked signed-in listener, as in e2e/account.spec.ts: the app is built against a Supabase
// address that does not exist (see playwright.config.ts), a session is a cookie written here,
// and the requests the browser makes to that address are answered in the browser.

const AUTH_HOST = 'http://localhost:54331';
const STORAGE_KEY = 'sb-localhost-auth-token';
export const USER_ID = '00000000-0000-4000-8000-000000000001';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'sasha@example.com',
    app_metadata: { provider: 'google' },
    user_metadata: { full_name: 'Oleksandr Klymenko', welcomeSeenAt: 1 },
    created_at: new Date().toISOString(),
  };
  return {
    access_token: `${b64({ alg: 'none' })}.${b64({ sub: user.id, exp })}.sig`,
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user,
  };
}

export async function signIn(page: Page) {
  await page
    .context()
    .addCookies([
      { name: STORAGE_KEY, value: `base64-${b64(fakeSession())}`, url: 'http://localhost' },
    ]);
  await page.route(`${AUTH_HOST}/**`, (route) => route.fulfill({ status: 204 }));
}
