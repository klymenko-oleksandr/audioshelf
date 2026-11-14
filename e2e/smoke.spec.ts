import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('home renders in the browser language', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'uk-UA' });
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Audioshelf' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
    await expect(page.getByText('Безкоштовні аудіокниги')).toBeVisible();
    await context.close();
  });

  test('language switcher changes the language and it survives a reload', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'uk-UA' });
    const page = await context.newPage();
    await page.goto('/');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('Free audiobooks')).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(new URL(page.url()).pathname).toBe('/');
    await context.close();
  });
});
