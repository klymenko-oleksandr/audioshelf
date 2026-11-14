import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1440, height: 1024 };

async function open(page: Page, path: string, size = DESKTOP) {
  await page.setViewportSize(size);
  await page.goto(path);
}

test.describe('language', () => {
  test.use({ locale: 'uk-UA' });

  test('home renders in the browser language', async ({ page }) => {
    await open(page, '/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByRole('heading', { level: 1, name: 'Головна' })).toBeVisible();
  });

  test('the switcher in Settings changes the language and it survives a reload', async ({
    page,
  }) => {
    await open(page, '/settings');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(new URL(page.url()).pathname).toBe('/settings');
  });
});

test.describe('shell', () => {
  test.use({ locale: 'en-US' });

  test('desktop shows the full sidebar and navigates without a reload', async ({ page }) => {
    await open(page, '/', DESKTOP);
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'You', exact: true })).toBeHidden();

    await sidebar.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('region', { name: 'Player' })).toBeVisible();
  });

  test('tablet shows the icon rail', async ({ page }) => {
    await open(page, '/explore', TABLET);
    await expect(page.getByRole('complementary')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Offline' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('searchbox', { name: 'Search' })).toBeVisible();
  });

  test('phone shows the tab bar with the mini-player above it', async ({ page }) => {
    await open(page, '/', PHONE);
    await expect(page.getByRole('complementary')).toBeHidden();
    const you = page.getByRole('link', { name: 'You', exact: true });
    await expect(you).toBeVisible();

    const player = await page.getByRole('region', { name: 'Player' }).boundingBox();
    const tab = await you.boundingBox();
    expect(player && tab && player.y + player.height <= tab.y + 1).toBe(true);

    await you.click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('the search field submits to /search with the query in the URL', async ({ page }) => {
    await open(page, '/', DESKTOP);
    await page.getByRole('searchbox', { name: 'Search' }).fill('кобзар');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    expect(new URL(page.url()).searchParams.get('q')).toBe('кобзар');
  });

  test('unknown URLs show NotFound inside the shell with a 404 status', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: "This page isn't here" }),
    ).toBeVisible();
    await expect(page.getByRole('complementary')).toBeVisible();
    await page.getByRole('link', { name: 'Go home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
