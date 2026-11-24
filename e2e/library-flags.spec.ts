import { expect, test, type Page } from '@playwright/test';
import { waitForSaved } from './saved';

// Read-only: likes and Listen later live in the browser (IndexedDB), nothing is written to the
// server. Every test gets a fresh browser context, so it starts with nothing liked.
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });

const PHONE = { width: 390, height: 844 };
const toastOf = (page: Page) => page.getByRole('status');

test.describe('likes and Listen later', () => {
  test('like and unlike on the book page, each with a toast and Undo', async ({ page }) => {
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');

    await main.getByRole('button', { name: 'Like', exact: true }).first().click();
    await expect(main.getByRole('button', { name: 'Unlike' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(toastOf(page).getByText('Added to Liked')).toBeVisible();

    await toastOf(page).getByRole('button', { name: 'Undo' }).click();
    await expect(main.getByRole('button', { name: 'Like', exact: true }).first()).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await main.getByRole('button', { name: 'Like', exact: true }).first().click();
    await main.getByRole('button', { name: 'Unlike' }).first().click();
    await expect(toastOf(page).getByText('Removed from Liked')).toBeVisible();
  });

  test('Undo of an unlike brings the like back', async ({ page }) => {
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Like', exact: true }).first().click();
    await main.getByRole('button', { name: 'Unlike' }).first().click();
    await expect(toastOf(page).getByText('Removed from Liked')).toBeVisible();
    await toastOf(page).getByRole('button', { name: 'Undo' }).click();
    await expect(main.getByRole('button', { name: 'Unlike' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Listen later on the book page survives a reload', async ({ page }) => {
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Listen later' }).click();
    await expect(toastOf(page).getByText('Added to Listen later')).toBeVisible();
    await expect(main.getByRole('button', { name: 'In Listen later' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(main.getByRole('button', { name: 'In Listen later' })).toBeVisible();

    await main.getByRole('button', { name: 'In Listen later' }).click();
    await expect(toastOf(page).getByText('Removed from Listen later')).toBeVisible();
    await page.reload();
    await expect(main.getByRole('button', { name: 'Listen later' })).toBeVisible();
  });

  test('a like survives a reload and shows on the other pages', async ({ page }) => {
    await page.goto('/book/try-tony');
    await page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first().click();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Unlike' }).first(),
    ).toBeVisible();
    await waitForSaved(page, 'likes', 1);

    await page.reload();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Unlike' }).first(),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/search?q=тон');
    await expect(page.getByRole('button', { name: 'Unlike' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the heart on a search row likes the book', async ({ page }) => {
    await page.goto('/search?q=Лес');
    const heart = page.getByRole('button', { name: 'Like', exact: true }).first();
    await heart.click();
    await expect(page.getByRole('button', { name: 'Unlike' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(toastOf(page).getByText('Added to Liked')).toBeVisible();
  });

  test('a card can be liked and added to Listen later from its actions menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Add to Listen later' }).click();
    await expect(toastOf(page).getByText('Added to Listen later')).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).first().click();
    await expect(page.getByRole('menuitem', { name: 'Remove from Listen later' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Like', exact: true }).first().click({ force: true });
    await expect(toastOf(page).getByText('Added to Liked')).toBeVisible();
  });

  test('phone book page: Like and Later under Play', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');

    await main.getByRole('button', { name: 'Like', exact: true }).filter({ visible: true }).click();
    await expect(main.getByRole('button', { name: 'Liked' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const later = main.getByRole('button', { name: 'Later' });
    await later.click();
    await expect(later).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(main.getByRole('button', { name: 'Later' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(main.getByRole('button', { name: 'Liked' })).toBeVisible();
  });

  test('a change in one tab shows up in the other', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto('/book/try-tony');
    await second.goto('/book/try-tony');

    await first
      .getByRole('main')
      .getByRole('button', { name: 'Like', exact: true })
      .first()
      .click();
    await expect(
      second.getByRole('main').getByRole('button', { name: 'Unlike' }).first(),
    ).toHaveAttribute('aria-pressed', 'true');

    await second.getByRole('main').getByRole('button', { name: 'Listen later' }).click();
    await expect(
      first.getByRole('main').getByRole('button', { name: 'In Listen later' }),
    ).toBeVisible();

    await second.getByRole('main').getByRole('button', { name: 'Unlike' }).first().click();
    await expect(
      first.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first(),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('a saved book that no longer exists does not break the pages', async ({ page }) => {
    // Like a real book first, so the app has created its database; then add rows for a book
    // that is not in the catalogue (unpublished or deleted since).
    await page.goto('/book/try-tony');
    await page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first().click();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Unlike' }).first(),
    ).toBeVisible();
    await waitForSaved(page, 'likes', 1);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('audioshelf');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            try {
              const db = open.result;
              const tx = db.transaction(['likes', 'listenLater'], 'readwrite');
              const row = {
                bookId: '00000000-0000-4000-8000-000000000000',
                addedAt: 1,
                updatedAt: 1,
                deviceId: 'e2e',
              };
              tx.objectStore('likes').put(row);
              tx.objectStore('listenLater').put(row);
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            } catch (error) {
              reject(error);
            }
          };
        }),
    );
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await page.goto('/book/try-tony');
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first(),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
