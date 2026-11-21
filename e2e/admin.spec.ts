import { expect, test, type Page } from '@playwright/test';
import { ADMIN_SETUP_TOKEN, addVirtualPasskey, signInWithPasskey } from './fixtures/admin';

const DESKTOP = { width: 1440, height: 1024 };
const SIGN_IN = 'Sign in with passkey';

async function asVisitor(page: Page) {
  await page.setViewportSize(DESKTOP);
}

test.describe('admin: signed out', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => asVisitor(page));

  test('an admin page redirects to the login and returns there after signing in', async ({
    page,
  }) => {
    await page.goto('/admin/books?tab=draft');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fbooks%3Ftab%3Ddraft$/);
    await expect(page.getByRole('heading', { name: 'Sign in to admin' })).toBeVisible();

    await addVirtualPasskey(page);
    await page.getByRole('button', { name: SIGN_IN }).click();
    await expect(page).toHaveURL(/\/admin\/books\?tab=draft$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  });

  test('/admin and every other admin path go to the login', async ({ page }) => {
    for (const path of ['/admin', '/admin/books/new', '/admin/books/some-id', '/admin/whatever']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/admin\/login/);
    }
  });

  test('the admin API answers 401 without a session', async ({ request }) => {
    const response = await request.get('/api/admin/books');
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  test('a link outside the admin panel cannot be used as the return address', async ({ page }) => {
    await signInWithPasskey(page, '/admin/login?next=https://evil.example/');
    await expect(page).toHaveURL(/\/admin\/books$/);
  });

  test('admin responses are private and not indexable; robots.txt keeps crawlers out', async ({
    page,
    request,
  }) => {
    const login = await page.goto('/admin/login');
    expect(login?.headers()['cache-control']).toBe('private, no-store, max-age=0');
    expect(login?.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /api/admin');
  });
});

test.describe('admin: signing in', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => asVisitor(page));

  test('a passkey the server does not know is refused and the person stays on the form', async ({
    page,
  }) => {
    await addVirtualPasskey(page, 'stranger');
    await page.goto('/admin/login');
    await page.getByRole('button', { name: SIGN_IN }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('That passkey was not accepted.');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/books');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('without a passkey on the device, the prompt ends quietly and nothing is signed in', async ({
    page,
  }) => {
    // A virtual authenticator with no credential: the browser has nothing to offer.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page.goto('/admin/login');
    await page.getByRole('button', { name: SIGN_IN }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText(
      'The passkey prompt was closed. Try again when you are ready.',
    );
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('there is no password field and no attempt counter to attack', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByLabel('Password')).toHaveCount(0);
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('the session cookie is httpOnly and ends with the browser session', async ({
    page,
    context,
  }) => {
    await signInWithPasskey(page);
    await expect(page).toHaveURL(/\/admin\/books$/);
    const cookie = (await context.cookies()).find((c) => c.name === 'admin_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.expires).toBe(-1);
    // The one-time challenge is gone once it has been answered.
    expect((await context.cookies()).find((c) => c.name === 'admin_challenge')).toBeUndefined();
  });

  test('signing out ends the session', async ({ page }) => {
    await signInWithPasskey(page);
    await expect(page).toHaveURL(/\/admin\/books$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/books');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('a signed-in owner opening the login page lands on the books list', async ({ page }) => {
    await signInWithPasskey(page);
    await expect(page).toHaveURL(/\/admin\/books$/);
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/books$/);
  });
});

test.describe('admin: adding a passkey', () => {
  test.use({ locale: 'en-US' });
  test.beforeEach(async ({ page }) => asVisitor(page));

  test('a wrong setup token is refused', async ({ page }) => {
    await addVirtualPasskey(page);
    await page.goto('/admin/login/setup');
    await page.getByLabel('Setup token').fill('not-the-token-not-the-token-not-the-token');
    await page.getByRole('button', { name: 'Create passkey' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('That setup token is not right.');
  });

  test('the right token makes a passkey and prints the entry for ADMIN_PASSKEYS', async ({
    page,
  }) => {
    // An empty authenticator on this page: the new passkey is created in it.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await page.goto(`/admin/login/setup?token=${ADMIN_SETUP_TOKEN}`);
    await page.getByLabel('Name (optional)').fill('Test laptop');
    await page.getByRole('button', { name: 'Create passkey' }).click();

    const entry = JSON.parse(await page.getByLabel('Passkey entry').inputValue());
    expect(entry).toMatchObject({ label: 'Test laptop' });
    expect(entry.id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(entry.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    // Setting it up signs nobody in.
    await page.goto('/admin/books');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe('admin: books list', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await signInWithPasskey(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  });

  test('has no listener shell: no player, no listener navigation', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Library' })).toHaveCount(0);
    await expect(page.locator('audio')).toHaveCount(0);
  });

  test('shows the figures, the tabs with counts and every book', async ({ page }) => {
    await expect(page.getByText('3 books · 0 h of audio')).toBeVisible();
    await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'All · 3' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Published · 2' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Drafts · 1' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Scheduled · 0' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Needs attention · 1' })).toBeVisible();

    const table = page.getByRole('table', { name: 'Books' });
    await expect(table.getByRole('link', { name: 'Три тони' })).toBeVisible();
    await expect(table.getByRole('link', { name: 'Старша книга' })).toBeVisible();
    await expect(table.getByRole('link', { name: 'Чернетка' })).toBeVisible();
  });

  test('flags a published book without a cover as needing attention', async ({ page }) => {
    await page.getByRole('link', { name: 'Needs attention · 1' }).click();
    await expect(page).toHaveURL(/tab=attention/);
    const table = page.getByRole('table', { name: 'Books' });
    await expect(table.getByRole('link', { name: 'Старша книга' })).toBeVisible();
    await expect(table.getByText('Published · Cover missing')).toBeVisible();
    await expect(table.getByRole('link', { name: 'Три тони' })).toHaveCount(0);
  });

  test('a tab narrows the list and is kept in the URL', async ({ page }) => {
    await page.getByRole('link', { name: 'Drafts · 1' }).click();
    await expect(page).toHaveURL(/tab=draft/);
    const table = page.getByRole('table', { name: 'Books' });
    await expect(table.getByRole('link', { name: 'Чернетка' })).toBeVisible();
    await expect(table.getByRole('link', { name: 'Три тони' })).toHaveCount(0);
  });

  test('search finds a book by title after a pause and keeps the URL', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search books' });
    await search.fill('тони');
    await expect(page).toHaveURL(/q=%D1%82%D0%BE%D0%BD%D0%B8/);
    const table = page.getByRole('table', { name: 'Books' });
    await expect(table.getByRole('link', { name: 'Три тони' })).toBeVisible();
    await expect(table.getByRole('link', { name: 'Чернетка' })).toHaveCount(0);
    await expect(search).toBeFocused();

    await search.fill('нічого такого');
    await expect(page.getByRole('heading', { name: 'No books match' })).toBeVisible();
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(/\/admin\/books$/);
  });

  test('the category filter and the sort menu change the list', async ({ page }) => {
    await page.getByRole('button', { name: /^Category/ }).click();
    await page.getByRole('menuitemradio', { name: 'Poetry' }).click();
    await expect(page).toHaveURL(/category=poetry/);
    await expect(page.getByRole('heading', { name: 'No books match' })).toBeVisible();

    await page.goto('/admin/books');
    await page.getByRole('button', { name: /Last updated/ }).click();
    await page.getByRole('menuitemradio', { name: 'Title (A–Z)' }).click();
    await expect(page).toHaveURL(/sort=title/);
  });

  test('a book opens its page, and New book leads somewhere', async ({ page }) => {
    await page.getByRole('link', { name: 'Три тони' }).click();
    await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}$/);
    await page.goto('/admin/books');
    await page.getByRole('link', { name: 'New book' }).first().click();
    await expect(page).toHaveURL(/\/admin\/books\/new$/);
  });

  test('an unknown admin page is a not-found page inside the panel', async ({ page }) => {
    const response = await page.goto('/admin/nothing-here');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('There is no such page in the admin panel.')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
  });
});

test.describe('listener app after the route split', () => {
  test.use({ locale: 'en-US' });

  test('an unknown address is still a 404 inside the listener shell', async ({ page }) => {
    const response = await page.goto('/definitely/not/a/page');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: "This page isn't here" }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore' }).first()).toBeVisible();
  });
});
