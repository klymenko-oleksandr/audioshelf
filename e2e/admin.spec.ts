import { expect, test, type Page } from '@playwright/test';
import { ADMIN_PASSWORD } from './fixtures/admin';

const DESKTOP = { width: 1440, height: 1024 };
const LOCK_TEXT = 'Too many wrong passwords. Try again in 15 minutes.';

let counter = 0;
/** Every test signs in from its own made-up address, so lockouts never leak between tests. */
async function asVisitor(page: Page) {
  counter += 1;
  const ip = `198.51.${test.info().workerIndex}.${(counter % 200) + 1}`;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `${ip}-${test.info().testId}`.slice(0, 60) });
  await page.setViewportSize(DESKTOP);
}

async function signIn(page: Page, password: string) {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
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

    await signIn(page, ADMIN_PASSWORD);
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
    const response = await request.get('/api/admin/books', {
      headers: { 'x-forwarded-for': '203.0.113.200' },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  test('a link outside the admin panel cannot be used as the return address', async ({ page }) => {
    await page.goto('/admin/login?next=https://evil.example/');
    await signIn(page, ADMIN_PASSWORD);
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

  test('a wrong password says how many attempts are left and keeps the person on the form', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await signIn(page, 'not-the-password');
    await expect(page.locator('#admin-password-error')).toHaveText(
      'Wrong password. 4 attempts left before a 15-minute lock.',
    );
    await expect(page).toHaveURL(/\/admin\/login$/);

    await signIn(page, 'still-not-the-password');
    await expect(page.locator('#admin-password-error')).toHaveText(
      'Wrong password. 3 attempts left before a 15-minute lock.',
    );
  });

  test('the password can be shown and hidden', async ({ page }) => {
    await page.goto('/admin/login');
    const field = page.getByLabel('Password', { exact: true });
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  test('five wrong passwords lock the address, even for the right password', async ({ page }) => {
    await page.goto('/admin/login');
    for (const left of ['4 attempts', '3 attempts', '2 attempts', '1 attempt']) {
      await signIn(page, 'wrong-password');
      await expect(page.locator('#admin-password-error')).toHaveText(
        `Wrong password. ${left} left before a 15-minute lock.`,
      );
    }
    await signIn(page, 'wrong-password');
    await expect(page.locator('#admin-password-error')).toHaveText(LOCK_TEXT);

    // The right password is refused while locked.
    await signIn(page, ADMIN_PASSWORD);
    await expect(page.locator('#admin-password-error')).toHaveText(LOCK_TEXT);
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/books');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("someone else's wrong guesses do not lock the owner out", async ({ page, browser }) => {
    // A stranger on another address burns all their attempts…
    const stranger = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${test.info().workerIndex}-stranger` },
    });
    const strangerPage = await stranger.newPage();
    await strangerPage.goto('/admin/login');
    const strangerError = strangerPage.locator('#admin-password-error');
    for (const left of ['4 attempts', '3 attempts', '2 attempts', '1 attempt']) {
      await strangerPage.getByLabel('Password', { exact: true }).fill('a-guess');
      await strangerPage.getByRole('button', { name: 'Sign in' }).click();
      await expect(strangerError).toHaveText(
        `Wrong password. ${left} left before a 15-minute lock.`,
      );
    }
    await strangerPage.getByLabel('Password', { exact: true }).fill('a-guess');
    await strangerPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(strangerPage.locator('#admin-password-error')).toHaveText(LOCK_TEXT);
    await stranger.close();

    // …and the owner signs in without any wait.
    await page.goto('/admin/login');
    await signIn(page, ADMIN_PASSWORD);
    await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  });

  test('the session cookie is httpOnly and ends with the browser session', async ({
    page,
    context,
  }) => {
    await page.goto('/admin/login');
    await signIn(page, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\/books$/);
    const cookie = (await context.cookies()).find((c) => c.name === 'admin_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.expires).toBe(-1);
  });

  test('signing out ends the session', async ({ page }) => {
    await page.goto('/admin/login');
    await signIn(page, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\/books$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin/books');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('a signed-in owner opening the login page lands on the books list', async ({ page }) => {
    await page.goto('/admin/login');
    await signIn(page, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\/books$/);
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/books$/);
  });
});

test.describe('admin: books list', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await asVisitor(page);
    await page.goto('/admin/login');
    await signIn(page, ADMIN_PASSWORD);
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
