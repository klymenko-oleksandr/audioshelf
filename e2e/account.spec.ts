import { expect, test, type Page } from '@playwright/test';

// Read-only and fully faked: the app is built against a Supabase address that does not exist
// (see playwright.config.ts). A signed-in listener is a session written to localStorage, and the
// few requests the browser makes to that address are answered here. Nothing reaches real Google
// or Supabase, and nothing is written to the server.
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });

const AUTH_HOST = 'http://localhost:54331';
const STORAGE_KEY = 'sb-localhost-auth-token';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
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

async function signedIn(page: Page) {
  // The @supabase/ssr browser client keeps its session in a cookie: "base64-" + base64url(JSON).
  await page.context().addCookies([
    {
      name: STORAGE_KEY,
      value: `base64-${b64(fakeSession())}`,
      url: 'http://localhost',
    },
  ]);
  // Sign-out tells the server too; answer it.
  await page.route(`${AUTH_HOST}/**`, (route) => route.fulfill({ status: 204 }));
}

test.describe('guest', () => {
  test('the sign-in page offers Google and guest listening, and keeps where to come back to', async ({
    page,
  }) => {
    await page.goto('/signin?next=%2Fbook%2Fdracula');
    await expect(
      page.getByRole('heading', { name: 'Keep your place on every device' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Keep listening as a guest' })).toHaveAttribute(
      'href',
      '/book/dracula',
    );
    await expect(page.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/book/dracula',
    );
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('a next that leaves the app, or loops back into sign-in, is ignored', async ({ page }) => {
    for (const next of ['https://evil.example/', '//evil.example', '/signin?next=/x', '/admin']) {
      await page.goto(`/signin?next=${encodeURIComponent(next)}`);
      await expect(page.getByRole('link', { name: 'Keep listening as a guest' })).toHaveAttribute(
        'href',
        '/',
      );
    }
  });

  test('"Continue with Google" goes to the auth server with the callback and next', async ({
    page,
  }) => {
    await page.route(`${AUTH_HOST}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>fake auth</title>' }),
    );
    await page.goto('/signin?next=%2Flibrary');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await page.waitForURL(`${AUTH_HOST}/auth/v1/authorize**`);
    const url = new URL(page.url());
    expect(url.searchParams.get('provider')).toBe('google');
    const back = new URL(url.searchParams.get('redirect_to')!);
    expect(back.pathname).toBe('/auth/callback');
    expect(back.searchParams.get('next')).toBe('/library');
  });

  test('a cancelled or failed sign-in explains itself and can be retried', async ({ page }) => {
    await page.goto('/signin?error=cancelled');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Sign-in was cancelled');
    await page.goto('/signin?error=failed');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      "We couldn't sign you in",
    );
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  test('Settings invites a guest to sign in and comes back there', async ({ page }) => {
    await page.goto('/settings');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Continue with Google' }),
    ).toHaveAttribute('href', '/signin?next=%2Fsettings');
  });

  test('the callback sends a refused or broken sign-in back to the sign-in page', async ({
    request,
  }) => {
    const refused = await request.get('/auth/callback?error=access_denied&next=%2Flibrary', {
      maxRedirects: 0,
    });
    expect(refused.status()).toBe(307);
    const location = new URL(refused.headers().location!);
    expect(location.pathname).toBe('/signin');
    expect(location.searchParams.get('error')).toBe('cancelled');
    expect(location.searchParams.get('next')).toBe('/library');

    const noCode = await request.get('/auth/callback?next=https%3A%2F%2Fevil.example', {
      maxRedirects: 0,
    });
    const back = new URL(noCode.headers().location!);
    expect(back.origin).toBe(new URL(noCode.url()).origin);
    expect(back.searchParams.get('error')).toBe('failed');
  });
});

test.describe('signed in', () => {
  test('the top bar shows the avatar instead of "Sign in"', async ({ page }) => {
    await signedIn(page);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Account and settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);
  });

  test('the sign-in page sends them straight on', async ({ page }) => {
    await signedIn(page);
    await page.goto('/signin?next=%2Flibrary');
    await page.waitForURL('**/library');
  });

  test('Settings shows the account, and signing out turns the page back into a guest', async ({
    page,
  }) => {
    await signedIn(page);
    await page.goto('/settings');
    const main = page.getByRole('main');
    await expect(main.getByText('sasha@example.com')).toBeVisible();
    await expect(main.getByText('Oleksandr Klymenko')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Continue with Google' }),
    ).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});
