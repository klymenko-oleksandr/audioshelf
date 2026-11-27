import { expect, test } from '@playwright/test';
import { waitForSaved } from './saved';

// Read-only: settings live in the browser (IndexedDB), nothing is written to the server.
test.use({ locale: 'en-US', viewport: { width: 1280, height: 900 } });

const theme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('settings', () => {
  test('shows every section, with Downloads disabled', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    for (const name of ['Playback', 'Appearance', 'Downloads']) {
      await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole('switch', { name: 'Download over Wi-Fi only' })).toBeDisabled();
    await expect(page.locator('#content').getByText('Soon')).toBeVisible();
  });

  test('the theme applies at once and survives a reload', async ({ page }) => {
    await page.goto('/settings');
    await page
      .getByRole('radiogroup', { name: 'Theme' })
      .getByRole('radio', { name: 'Dark' })
      .click();
    expect(await theme(page)).toBe('dark');
    await page.reload();
    expect(await theme(page)).toBe('dark');
    await page
      .getByRole('radiogroup', { name: 'Theme' })
      .getByRole('radio', { name: 'System' })
      .click();
    expect(await theme(page)).toBeNull();
  });

  test('the theme is set before first paint', async ({ page }) => {
    await page.goto('/settings');
    await page
      .getByRole('radiogroup', { name: 'Theme' })
      .getByRole('radio', { name: 'Dark' })
      .click();
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __themeAtLoad: string | null }).__themeAtLoad =
          document.documentElement.getAttribute('data-theme');
      });
    });
    await page.reload();
    expect(
      await page.evaluate(() => (window as unknown as { __themeAtLoad: string }).__themeAtLoad),
    ).toBe('dark');
  });

  test('playback choices apply at once and survive a reload', async ({ page }) => {
    await page.goto('/settings');
    const back = page.getByRole('radiogroup', { name: 'Skip back' });
    await back.getByRole('radio', { name: '30 s' }).click();
    await expect(back.getByRole('radio', { name: '30 s' })).toBeChecked();
    const rewind = page.getByRole('switch', { name: 'Auto-rewind on resume' });
    await rewind.click();
    await expect(rewind).not.toBeChecked();
    // The screen changes before the write lands; a reload right now could cut it off.
    await waitForSaved(page, 'settings', 2);
    await page.reload();
    await expect(
      page.getByRole('radiogroup', { name: 'Skip back' }).getByRole('radio', { name: '30 s' }),
    ).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Auto-rewind on resume' })).not.toBeChecked();
  });

  test('a change in one tab shows up in the other', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto('/settings');
    await second.goto('/settings');
    await first
      .getByRole('radiogroup', { name: 'Theme' })
      .getByRole('radio', { name: 'Light' })
      .click();
    await expect.poll(() => theme(second)).toBe('light');
    await expect(
      second.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' }),
    ).toBeChecked();
  });
});
