import { expect, test, type Page } from '@playwright/test';

// Read-only: the welcome screen and the guest nudge keep their state in the browser (localStorage
// and IndexedDB), nothing is written to the server. Every test gets a fresh browser context.
// The config marks the welcome as seen so other specs are not interrupted; the welcome tests
// below start from nothing instead.
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });

const PHONE = { width: 390, height: 844 };
const NEW_BROWSER = { cookies: [], origins: [] };
const DAY = 24 * 60 * 60 * 1000;

const welcome = (page: Page) => page.getByRole('dialog', { name: /Stories that remember/ });
const nudge = (page: Page) => page.getByRole('dialog', { name: 'Keep these on every device' });
const toastOf = (page: Page) => page.getByRole('status');

/** Reads one `meta` row from IndexedDB (the database exists once any page has loaded). */
function metaRow(page: Page, key: string) {
  return page.evaluate(
    (rowKey) =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open('audioshelf');
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('meta')) {
            db.close();
            resolve(undefined);
            return;
          }
          const get = db.transaction('meta').objectStore('meta').get(rowKey);
          get.onsuccess = () => {
            db.close();
            resolve(get.result?.value);
          };
        };
      }),
    key,
  );
}

/** True once the app has created its database with the `meta` store (never creates it itself). */
function dbReady(page: Page) {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === 'audioshelf' && (d.version ?? 0) >= 2)) return false;
    return new Promise<boolean>((resolve) => {
      const open = indexedDB.open('audioshelf');
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const ok = open.result.objectStoreNames.contains('meta');
        open.result.close();
        resolve(ok);
      };
    });
  });
}

async function putMeta(page: Page, key: string, value: unknown) {
  await expect.poll(() => dbReady(page)).toBe(true);
  await page.evaluate(
    ([rowKey, rowValue]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('audioshelf');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('meta', 'readwrite');
          tx.objectStore('meta').put({ key: rowKey, value: rowValue });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as const,
  );
}

/** Wait until the welcome is saved in IndexedDB, so a page load cannot cut the write off. */
const welcomeSaved = (page: Page) =>
  expect.poll(() => metaRow(page, 'welcomeSeenAt').then((v) => typeof v === 'number')).toBe(true);

/** Close the toast (Undo toast) so the nudge may appear. */
async function closeToast(page: Page) {
  await toastOf(page).getByRole('button', { name: 'Close' }).click();
  await expect(toastOf(page)).toBeEmpty();
}

test.describe('welcome screen', () => {
  test.use({ storageState: NEW_BROWSER });

  test('a new browser sees it on Home, over the splash, and Skip counts as seen', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-app-ready', 'x');
    await expect(welcome(page).getByRole('heading', { level: 1 })).toHaveText(
      'Stories that remember where you stopped',
    );

    await welcome(page).getByRole('button', { name: 'Skip' }).filter({ visible: true }).click();
    await expect(welcome(page)).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await welcomeSaved(page);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test('no flash on a repeat visit: the page is decided before the first paint', async ({
    page,
  }) => {
    await page.goto('/');
    await welcome(page).getByRole('button', { name: 'Start listening' }).click();
    await welcomeSaved(page);

    // Record what the head script decides on the next load, before any app code runs.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __welcomeAttr: string | null }).__welcomeAttr =
          document.documentElement.getAttribute('data-welcome');
      });
    });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    expect(
      await page.evaluate(() => (window as never as { __welcomeAttr: unknown }).__welcomeAttr),
    ).toBeNull();
    await expect(welcome(page)).toHaveCount(0);
    // The splash is the app's own and lifts as before.
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', '');
  });

  test('finishing it ("Start listening") counts as seen', async ({ page }) => {
    await page.goto('/');
    await welcome(page).getByRole('button', { name: 'Start listening' }).click();
    await expect(welcome(page)).toBeHidden();
    await welcomeSaved(page);
    await page.goto('/');
    await expect(welcome(page)).toHaveCount(0);
  });

  test('Escape skips it', async ({ page }) => {
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(welcome(page)).toBeHidden();
    await welcomeSaved(page);
  });

  test('never on a deep link, and a deep link does not use it up', async ({ page }) => {
    await page.goto('/book/try-tony');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Три тони' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);

    for (const path of ['/search?q=тон', '/library', '/settings', '/explore']) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(welcome(page)).toHaveCount(0);
    }

    // Going Home inside the app is not a first visit to Home either.
    await page.goto('/book/try-tony');
    await page.getByRole('link', { name: 'Home' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);

    // A fresh visit to Home still gets it.
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
  });

  test('Home with the full-screen player hash is not a landing', async ({ page }) => {
    await page.goto('/#player');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test('someone who already used the app here is not welcomed', async ({ page }) => {
    await page.goto('/settings');
    await putMeta(page, 'deviceId', 'e2e-device'); // makes sure the database exists
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('audioshelf');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('progress', 'readwrite');
            tx.objectStore('progress').put({
              bookId: '00000000-0000-4000-8000-000000000000',
              position: 30,
              duration: 600,
              speed: 1,
              finished: false,
              updatedAt: 1,
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });

  test('the sign-in link keeps Home and leaves the welcome behind', async ({ page }) => {
    await page.goto('/');
    await welcome(page).getByRole('link', { name: 'Sign in with Google' }).click();
    await expect(page).toHaveURL(/\/signin\?next=%2F$/);
    await expect(welcome(page)).toHaveCount(0);
    await welcomeSaved(page);
  });

  test('a shared link and playback are never blocked: Skip leaves Home usable', async ({
    page,
  }) => {
    await page.goto('/');
    await welcome(page).getByRole('button', { name: 'Skip' }).filter({ visible: true }).click();
    await page
      .getByRole('link', { name: /Три тони/ })
      .first()
      .click();
    await expect(page.getByRole('main').getByRole('heading', { name: 'Три тони' })).toBeVisible();
    await page
      .getByRole('main')
      .getByRole('button', { name: /^(Play|Три тони)/ })
      .first()
      .click();
    await expect(
      page.getByRole('region', { name: 'Player' }).or(page.locator('footer')),
    ).toBeVisible();
  });

  test('skipping in one tab closes it in the other', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto('/');
    await second.goto('/');
    await expect(welcome(first)).toBeVisible();
    await expect(welcome(second)).toBeVisible();

    await welcome(first).getByRole('button', { name: 'Skip' }).filter({ visible: true }).click();
    await expect(welcome(second)).toBeHidden();
  });

  test('the language buttons switch the interface language', async ({ page }) => {
    await page.goto('/');
    await welcome(page).getByRole('button', { name: 'Українська' }).click();
    await expect(page.getByRole('dialog', { name: /Історії, що пам/ })).toBeVisible();
  });

  test('phone layout fits the screen', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(welcome(page)).toBeVisible();
    await expect(welcome(page).getByRole('button', { name: 'Start listening' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await welcome(page).getByRole('button', { name: 'Skip' }).filter({ visible: true }).click();
    await expect(welcome(page)).toBeHidden();
  });
});

test.describe('guest nudge', () => {
  test('appears after the 3rd like or Listen later, not before, and waits for the toast', async ({
    page,
  }) => {
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');

    await main.getByRole('button', { name: 'Like', exact: true }).first().click();
    await main.getByRole('button', { name: 'Listen later' }).click();
    await expect(toastOf(page).getByText('Added to Listen later')).toBeVisible();
    await closeToast(page);
    await expect(nudge(page)).toHaveCount(0);

    // Unliking does not lower the count; a like on another book is the 3rd add.
    await main.getByRole('button', { name: 'Unlike' }).first().click();
    await closeToast(page);
    await expect(nudge(page)).toHaveCount(0);
    await main.getByRole('button', { name: 'Like', exact: true }).first().click();

    // Past the threshold now, but the Undo toast is up, so the card must not stack on it.
    await expect(toastOf(page).getByText('Added to Liked')).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);
    await closeToast(page);
    await expect(nudge(page)).toBeVisible();
  });

  test('says plainly that clearing site data loses it, and the sign-in link keeps the page', async ({
    page,
  }) => {
    await putMeta(
      await (async () => {
        await page.goto('/search?q=тон');
        return page;
      })(),
      'guestNudge',
      { actions: 2 },
    );
    await page.goto('/book/try-tony?tab=about');
    await page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first().click();
    await closeToast(page);

    const card = nudge(page);
    await expect(card).toBeVisible();
    await expect(card).toContainText("clear this site's data");
    await expect(card).toContainText('You liked 1 book');
    await expect(card.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/signin?next=%2Fbook%2Ftry-tony%3Ftab%3Dabout',
    );
  });

  test('every add path counts: book page, card menu, search row', async ({ page }) => {
    await page.goto('/book/try-tony');
    await page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first().click();
    await closeToast(page);

    await page.goto('/');
    await page.getByRole('button', { name: 'More actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Add to Listen later' }).click();
    await closeToast(page);
    await expect(nudge(page)).toHaveCount(0);

    await page.goto('/search?q=Старша');
    await page.getByRole('button', { name: 'Like', exact: true }).first().click();
    await closeToast(page);
    await expect(nudge(page)).toBeVisible();
  });

  test('Undo of an add and Undo of a removal do not count again', async ({ page }) => {
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Like', exact: true }).first().click(); // add 1
    await toastOf(page).getByRole('button', { name: 'Undo' }).click(); // undo of an add
    await main.getByRole('button', { name: 'Like', exact: true }).first().click(); // add 2
    await main.getByRole('button', { name: 'Unlike' }).first().click(); // removal
    await toastOf(page).getByRole('button', { name: 'Undo' }).click(); // undo of a removal
    await expect(toastOf(page)).toBeEmpty({ timeout: 10_000 });
    await expect(nudge(page)).toHaveCount(0); // only two real adds so far
    await expect.poll(() => metaRow(page, 'guestNudge')).toMatchObject({ actions: 2 });
  });

  test('Not now hides it, also after a reload, in other tabs, and it returns after 7 days', async ({
    context,
  }) => {
    const page = await context.newPage();
    const other = await context.newPage();
    await page.goto('/');
    await putMeta(page, 'guestNudge', { actions: 2 });
    await page.goto('/book/try-tony');
    await other.goto('/library');
    await page.getByRole('main').getByRole('button', { name: 'Like', exact: true }).first().click();
    await closeToast(page);
    await expect(nudge(page)).toBeVisible();
    await expect(nudge(other)).toBeVisible();

    await nudge(page).getByRole('button', { name: 'Not now' }).click();
    await expect(nudge(page)).toBeHidden();
    await expect(nudge(other)).toBeHidden();
    await expect
      .poll(() => metaRow(page, 'guestNudge'))
      .toMatchObject({ actions: 3, actionsAtDismiss: 3 });

    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(nudge(page)).toHaveCount(0);

    // 7 days later (the dismissal is moved back in time).
    await putMeta(page, 'guestNudge', {
      actions: 3,
      dismissedAt: Date.now() - 7 * DAY - 1000,
      actionsAtDismiss: 3,
    });
    await page.reload();
    await expect(nudge(page)).toBeVisible();
  });

  test('comes back after 10 more actions, sooner than 7 days', async ({ page }) => {
    await page.goto('/');
    await putMeta(page, 'guestNudge', {
      actions: 12,
      dismissedAt: Date.now() - DAY,
      actionsAtDismiss: 3,
    });
    await page.reload();
    await expect(nudge(page)).toHaveCount(0); // 9 more actions, 1 day: still snoozed

    await putMeta(page, 'guestNudge', {
      actions: 13,
      dismissedAt: Date.now() - DAY,
      actionsAtDismiss: 3,
    });
    await page.reload();
    await expect(nudge(page)).toBeVisible();
  });

  test('is not shown while the full-screen player is open, nor on the sign-in page', async ({
    page,
  }) => {
    await page.goto('/');
    await putMeta(page, 'guestNudge', { actions: 5 });
    await page.goto('/library');
    await expect(nudge(page)).toBeVisible();

    await page.evaluate(() => {
      window.location.hash = '#player';
    });
    await expect(nudge(page)).toBeHidden();
    await page.evaluate(() => {
      window.location.hash = '';
    });
    await expect(nudge(page)).toBeVisible();

    await nudge(page).getByRole('link', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/signin\?next=%2Flibrary$/);
    await expect(nudge(page)).toHaveCount(0);
    // Following the link counted as "Not now".
    await expect
      .poll(() => metaRow(page, 'guestNudge'))
      .toMatchObject({ dismissedAt: expect.any(Number) });
  });

  test('phone: sits above the player and the tab bar and fits the screen', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await putMeta(page, 'guestNudge', { actions: 3 });
    await page.reload();

    const card = nudge(page);
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    const tabBar = (await page.getByRole('navigation').last().boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(box.y + box.height).toBeLessThanOrEqual(tabBar.y);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
