import { expect, test, type Page } from '@playwright/test';

// Read-only: Liked, Listen later and History live in the browser (IndexedDB); nothing is
// written to the server. Every test gets a fresh browser context, so it starts empty.
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });

const PHONE = { width: 390, height: 844 };
const toastOf = (page: Page) => page.getByRole('status');
const count = (page: Page, tab: 'liked' | 'listenLater' | 'history') =>
  page.getByTestId(`library-count-${tab}`);
const bookLink = (page: Page, title: string) =>
  page.getByRole('main').getByRole('link', { name: title, exact: true });
const player = (page: Page) => page.getByRole('region', { name: 'Player' });

async function like(page: Page, slug: string) {
  await page.goto(`/book/${slug}`);
  const main = page.getByRole('main');
  await main
    .getByRole('button', { name: 'Like', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    main
      .getByRole('button', { name: /^(Unlike|Liked)$/ })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

async function listenLater(page: Page, slug: string) {
  await page.goto(`/book/${slug}`);
  await page.getByRole('main').getByRole('button', { name: 'Listen later' }).click();
  await expect(
    page.getByRole('main').getByRole('button', { name: 'In Listen later' }),
  ).toBeVisible();
}

/** Plays "Три тони" from its second chapter for a moment, then pauses: a saved place. */
async function listenToTryTony(page: Page) {
  await page.goto('/book/try-tony');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: /Другий тон/ }).click();
  await expect(player(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.waitForTimeout(1200);
  await main.getByRole('button', { name: 'Pause' }).click();
  await expect(main.getByRole('button', { name: /Resume/ })).toBeVisible();
}

test.describe('Library', () => {
  test('empty states per tab', async ({ page }) => {
    await page.goto('/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await expect(page.getByTestId('library-empty-history')).toContainText('Nothing here yet');
    await expect(page.getByRole('link', { name: 'Explore books' })).toHaveAttribute(
      'href',
      '/explore',
    );

    await page.getByRole('tab', { name: /Liked/ }).click();
    await expect(page.getByTestId('library-empty-liked')).toContainText('No liked books yet');
    await expect(page).toHaveURL(/tab=liked/);

    await page.getByRole('tab', { name: /Listen later/ }).click();
    await expect(page.getByTestId('library-empty-listenLater')).toContainText(
      'Nothing saved for later',
    );
    for (const tab of ['liked', 'listenLater', 'history'] as const) {
      await expect(count(page, tab)).toHaveText('0');
    }
  });

  test('tabs show their books and counts', async ({ page }) => {
    await like(page, 'try-tony');
    await listenLater(page, 'starsha-knyha');

    await page.goto('/library?tab=liked');
    await expect(count(page, 'liked')).toHaveText('1');
    await expect(count(page, 'listenLater')).toHaveText('1');
    await expect(count(page, 'history')).toHaveText('0');
    await expect(bookLink(page, 'Три тони')).toBeVisible();

    await page.getByRole('tab', { name: /Listen later/ }).click();
    await expect(bookLink(page, 'Старша книга')).toBeVisible();
    await expect(bookLink(page, 'Три тони')).toHaveCount(0);
  });

  test('unlike from the page works at once, with Undo', async ({ page }) => {
    await like(page, 'try-tony');
    await page.goto('/library?tab=liked');
    await expect(bookLink(page, 'Три тони')).toBeVisible();

    await page.getByRole('button', { name: 'Unlike' }).first().click({ force: true });
    await expect(toastOf(page).getByText('Removed from Liked')).toBeVisible();
    await expect(page.getByTestId('library-empty-liked')).toBeVisible();
    await expect(count(page, 'liked')).toHaveText('0');

    await toastOf(page).getByRole('button', { name: 'Undo' }).click();
    await expect(bookLink(page, 'Три тони')).toBeVisible();
    await expect(count(page, 'liked')).toHaveText('1');

    await page.reload();
    await expect(bookLink(page, 'Три тони')).toBeVisible();
  });

  test('removing from Listen later works at once, with Undo', async ({ page }) => {
    await listenLater(page, 'try-tony');
    await page.goto('/library?tab=listenLater');
    await expect(bookLink(page, 'Три тони')).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Remove from Listen later' }).click();
    await expect(toastOf(page).getByText('Removed from Listen later')).toBeVisible();
    await expect(page.getByTestId('library-empty-listenLater')).toBeVisible();

    await toastOf(page).getByRole('button', { name: 'Undo' }).click();
    await expect(bookLink(page, 'Три тони')).toBeVisible();
  });

  test('History gets the book once it is played, and keeps it after a reload', async ({ page }) => {
    await listenToTryTony(page);

    await page.goto('/library');
    const history = page.getByTestId('library-history');
    await expect(history.getByRole('link', { name: 'Три тони' })).toBeVisible();
    await expect(history).toContainText('left');
    await expect(count(page, 'history')).toHaveText('1');

    await page.reload();
    await expect(
      page.getByTestId('library-history').getByRole('link', { name: 'Три тони' }),
    ).toBeVisible();
    await expect(count(page, 'history')).toHaveText('1');
  });

  test('Continue listening: Remove hides the card only; the book stays in History', async ({
    page,
  }) => {
    await listenToTryTony(page);
    await page.goto('/');
    const section = page.getByRole('region', { name: 'Continue listening' });
    await expect(section.getByRole('article')).toHaveCount(1);

    await section.getByRole('button', { name: 'Remove from Continue listening' }).click();
    await expect(toastOf(page).getByText('Removed from Continue listening')).toBeVisible();
    await expect(section).toHaveCount(0);

    // Undo brings the card back.
    await toastOf(page).getByRole('button', { name: 'Undo' }).click();
    await expect(section.getByRole('article')).toHaveCount(1);

    await section.getByRole('button', { name: 'Remove from Continue listening' }).click();
    await expect(section).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Continue listening' })).toHaveCount(0);

    await page.goto('/library');
    await expect(
      page.getByTestId('library-history').getByRole('link', { name: 'Три тони' }),
    ).toBeVisible();
  });

  test('Remove from History asks first and clears the place too', async ({ page }) => {
    await listenToTryTony(page);
    await page.goto('/library');
    const history = page.getByTestId('library-history');

    await history.getByRole('button', { name: 'More actions for Три тони' }).click();
    await page.getByRole('menuitem', { name: 'Remove from History' }).click();
    await history.getByRole('button', { name: 'Cancel' }).click();
    await expect(history.getByRole('link', { name: 'Три тони' })).toBeVisible();

    await history.getByRole('button', { name: 'More actions for Три тони' }).click();
    await page.getByRole('menuitem', { name: 'Remove from History' }).click();
    await history.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByTestId('library-empty-history')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('library-empty-history')).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Continue listening' })).toHaveCount(0);
    // The page offers Play, not Resume: the place is gone.
    await page.goto('/book/try-tony');
    await expect(page.getByRole('main').getByRole('button', { name: /Resume/ })).toHaveCount(0);
  });

  test('a book played to the end is Finished in History and leaves Listen later', async ({
    page,
  }) => {
    await listenLater(page, 'try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: /Третій тон/ }).click();
    await player(page).getByRole('slider', { name: 'Position in book' }).focus();
    await page.keyboard.press('End');
    await expect(main.getByRole('button', { name: 'Play again' })).toBeVisible({ timeout: 15_000 });
    // Leave only once the finish is saved: a page load would cut a write in progress.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open('audioshelf');
              open.onsuccess = () => {
                const db = open.result;
                const all = db.transaction('history').objectStore('history').getAll();
                all.onsuccess = () => {
                  db.close();
                  resolve(all.result.some((row) => row.finishedAt !== undefined));
                };
              };
            }),
        ),
      )
      .toBe(true);

    await page.goto('/library');
    const history = page.getByTestId('library-history');
    await expect(history).toContainText('Finished');
    await expect(history.getByRole('button', { name: 'Play Три тони again' })).toBeVisible();
    await expect(count(page, 'listenLater')).toHaveText('0');
  });

  test('a change in one tab shows up in the other', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await second.goto('/library?tab=liked');
    await expect(count(second, 'liked')).toHaveText('0');

    await like(first, 'try-tony');
    await expect(count(second, 'liked')).toHaveText('1');
    await expect(bookLink(second, 'Три тони')).toBeVisible();

    await first.goto('/library?tab=liked');
    await first.getByRole('button', { name: 'Unlike' }).first().click({ force: true });
    await expect(count(second, 'liked')).toHaveText('0');
  });

  test('a saved book that no longer exists is skipped and does not break the page', async ({
    page,
  }) => {
    await like(page, 'try-tony');
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('audioshelf');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['likes', 'listenLater', 'history'], 'readwrite');
            const bookId = '00000000-0000-4000-8000-000000000000';
            const flag = { bookId, addedAt: 1, updatedAt: 1, deviceId: 'e2e' };
            tx.objectStore('likes').put(flag);
            tx.objectStore('listenLater').put(flag);
            tx.objectStore('history').put({
              bookId,
              startedAt: 1,
              lastPlayedAt: 1,
              updatedAt: 1,
              deviceId: 'e2e',
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );

    await page.goto('/library?tab=liked');
    await expect(bookLink(page, 'Три тони')).toBeVisible();
    await expect(count(page, 'liked')).toHaveText('1');
    await expect(count(page, 'listenLater')).toHaveText('0');
    await expect(count(page, 'history')).toHaveText('0');
  });

  test('sort lives in the URL and keeps its tab', async ({ page }) => {
    await like(page, 'try-tony');
    await like(page, 'starsha-knyha');
    await page.goto('/library?tab=liked');
    const titles = page.getByRole('main').locator('article h3, article a[href^="/book/"]');
    await expect(titles.first()).toBeVisible();

    await page.getByRole('button', { name: /Sort: Recently added/ }).click();
    await page.getByRole('menuitemradio', { name: 'Title (A–Z)' }).click();
    await expect(page).toHaveURL(/tab=liked&sort=title/);
    await expect(page.getByRole('button', { name: /Sort: Title/ })).toBeVisible();

    await page.getByRole('tab', { name: /History/ }).click();
    await expect(page).not.toHaveURL(/sort=/);
  });

  test('phone: the sort icon opens a sheet', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await like(page, 'try-tony');
    await like(page, 'starsha-knyha');
    await page.goto('/library?tab=liked');

    await page.getByRole('button', { name: /Sort: Recently added/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Sort by' });
    await sheet.getByRole('button', { name: 'Author (A–Z)' }).click();
    await expect(page).toHaveURL(/sort=author/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
