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

test.describe('system behaviours', () => {
  test.use({ locale: 'en-US' });

  test('the splash covers a cold start and is gone once the app is ready', async ({ page }) => {
    await open(page, '/');
    await expect(page.locator('html')).toHaveAttribute('data-app-ready', '');
    await expect(page.locator('#splash')).toBeHidden();
  });

  test('a held splash reveals the slow-connection message after 3 s', async ({ page }) => {
    await open(page, '/?splash=hold');
    const splash = page.locator('#splash');
    await expect(splash).toBeVisible();
    await expect(splash.getByText('Still loading')).toBeHidden();
    await expect(splash.getByText('Still loading')).toBeVisible({ timeout: 5000 });
    await expect(splash.getByRole('link', { name: 'Reload' })).toBeHidden();
  });

  test('toasts: one at a time, Undo runs the action, errors are alerts', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Plain' }).click();
    await expect(page.getByRole('status').getByText('Dracula is ready offline')).toBeVisible();

    await page.getByRole('button', { name: 'With Undo' }).click();
    await expect(page.getByText('Dracula is ready offline')).toBeHidden();
    await expect(page.getByText('Added to Listen later')).toBeVisible();

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText('Removed from Listen later')).toBeVisible();

    await page.getByRole('button', { name: 'Error', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: "Couldn't download Dracula" });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Close' }).click();
    await expect(alert).toBeHidden();
  });

  test('the toast sits above the player on desktop and on phone', async ({ page }) => {
    for (const size of [DESKTOP, PHONE]) {
      await open(page, '/dev/ui', size);
      await page.getByRole('button', { name: 'Plain' }).click();
      const toastBox = await page.getByText('Dracula is ready offline').boundingBox();
      const player = await page.getByRole('region', { name: 'Player' }).boundingBox();
      expect(toastBox && player && toastBox.y + toastBox.height <= player.y).toBe(true);
    }
  });

  test('loader timing: no skeleton for a fast load, 300–900 ms for the PRD example', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    const log = page.getByTestId('loader-log');

    await page.getByRole('button', { name: 'Load 200 ms' }).click();
    await page.waitForTimeout(700);
    await expect(log).toHaveText('Loading for 200 ms');

    await page.getByRole('button', { name: 'Load 400 ms' }).click();
    await expect(log).toContainText('skeleton hidden at');
    const [shown = 0, hidden = 0] =
      ((await log.textContent()) ?? '')
        .match(/at (\d+) ms/g)
        ?.map((m) => Number(m.replace(/\D/g, ''))) ?? [];
    expect(shown).toBeGreaterThanOrEqual(290);
    expect(shown).toBeLessThan(400);
    expect(hidden - shown).toBeGreaterThanOrEqual(590);
    expect(hidden - shown).toBeLessThan(750);
  });

  test('a broken page shows the inline error inside the shell and can retry', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Break this page' }).click();

    await expect(page.getByRole('heading', { name: "This page didn't load" })).toBeVisible();
    await expect(page.getByRole('complementary')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Player' })).toBeVisible();

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'UI showcase' })).toBeVisible();
  });
});

test.describe('components', () => {
  test.use({ locale: 'en-US' });

  test('book card: hover reveals actions, the heart toggles, the menu is not the place for Like', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    const card = page.getByRole('article').filter({ hasText: 'Кобзар' });
    const play = card.getByRole('button', { name: 'Play Кобзар' });
    await expect(play).toHaveCSS('opacity', '0');

    await card.hover();
    await expect(play).toHaveCSS('opacity', '1');

    await card.getByRole('button', { name: 'Like', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Unlike' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await card.getByRole('button', { name: 'More actions' }).first().click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Play',
      'Add to Listen later',
      'Download',
      'Go to author',
      'Share',
    ]);
    await expect(play).toHaveCSS('opacity', '1'); // stays active while the menu is open

    await menu.getByRole('menuitem', { name: 'Add to Listen later' }).click();
    await expect(page.getByRole('status').getByText('Added to Listen later')).toBeVisible();
    await expect(menu).toBeHidden();
  });

  test('book card: keyboard focus reveals the actions', async ({ page }) => {
    await open(page, '/dev/ui');
    const card = page.getByRole('article').filter({ hasText: 'Кобзар' });
    await card.getByRole('link', { name: 'Кобзар, Тарас Шевченко' }).focus();
    await expect(card.getByRole('button', { name: 'Play Кобзар' })).toHaveCSS('opacity', '1');
  });

  test('player bar: states switch the controls', async ({ page }) => {
    await open(page, '/dev/ui');
    const demo = page.getByTestId('player-demo');
    await expect(demo.getByRole('button', { name: 'Pause' })).toBeVisible();

    await demo.getByRole('button', { name: 'Pause' }).click();
    await expect(demo.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'error', exact: true }).click();
    await expect(demo.getByRole('alert')).toContainText("Couldn't load this chapter");
    await demo.getByRole('button', { name: 'Try again' }).click();
    await expect(demo.getByRole('button', { name: 'Loading…' })).toBeVisible();

    await page.getByRole('button', { name: 'finished', exact: true }).click();
    await expect(demo.getByRole('button', { name: 'Play again' })).toBeVisible();
  });

  test('nothing overflows sideways at phone, tablet or desktop width', async ({ page }) => {
    for (const size of [PHONE, TABLET, { width: 1024, height: 768 }, DESKTOP]) {
      await open(page, '/dev/ui', size);
      await page.getByRole('button', { name: 'error', exact: true }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${size.width}px`).toBe(0);
    }
  });

  test('bottom sheet: Back closes it without leaving the page; Esc leaves history clean', async ({
    page,
  }) => {
    await open(page, '/', PHONE);
    await page.goto('/dev/ui');
    const dialog = page.getByRole('dialog', { name: 'Playback speed' });

    await page.getByRole('button', { name: 'Open sheet' }).click();
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/dev/ui');

    await page.getByRole('button', { name: 'Open sheet' }).click();
    await dialog.getByRole('button', { name: '1.5×' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('sheet-value')).toHaveText('Speed: 1.5×');

    await page.getByRole('button', { name: 'Open sheet' }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Three open/close cycles later, one Back still returns to the previous page.
    await page.waitForTimeout(100);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test('book card on touch: the … button opens the actions sheet with Like in it', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.goto('/dev/ui');
    const card = page.getByRole('article').filter({ hasText: 'Кобзар' });

    await expect(card.getByRole('button', { name: 'Play Кобзар' })).toBeHidden();
    await card.getByRole('button', { name: 'More actions' }).tap();

    const sheet = page.getByRole('dialog', { name: 'Book actions' });
    await expect(sheet.getByRole('button')).toHaveText([
      'Play',
      'Like',
      'Add to Listen later',
      'Download',
      'Go to author',
      'Share',
    ]);
    await sheet.getByRole('button', { name: 'Like' }).tap();
    await expect(sheet).toBeHidden();
    await expect(card.getByText('Liked')).toBeAttached();
    await context.close();
  });
});

test.describe('player', () => {
  test.use({ locale: 'en-US' });

  const live = (page: Page) => page.getByTestId('live-player');
  const bar = (page: Page) => page.getByRole('region', { name: 'Player' });
  const positionOf = async (page: Page) =>
    Number(((await live(page).textContent()) ?? '').match(/position ([\d.]+)/)?.[1] ?? Number.NaN);
  const waitForPosition = (page: Page, atLeast: number) =>
    expect.poll(() => positionOf(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(atLeast);

  test('plays, pauses and resumes; the bar shows the book and the position moves', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();

    await expect(live(page)).toContainText('status playing');
    await expect(bar(page).getByText('Test book', { exact: true }).last()).toBeVisible();
    await expect(bar(page).getByText('Ch. 1 · Tone 1')).toBeVisible();
    await waitForPosition(page, 1);

    await bar(page).getByRole('button', { name: 'Pause' }).click();
    await expect(live(page)).toContainText('status paused');
    const paused = await positionOf(page);
    await page.waitForTimeout(700);
    expect(await positionOf(page)).toBe(paused);

    await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
    await expect(live(page)).toContainText('status playing');
    await waitForPosition(page, paused + 0.5);
  });

  test('continues from one track into the next as one book', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play from 0:05' }).click();
    await waitForPosition(page, 6.5); // track 1 is 6.03 s long
    await expect(live(page)).toContainText('status playing');
    await expect(live(page)).toContainText('chapter 2');
    await expect(bar(page).getByText('Ch. 2 · Tone 2')).toBeVisible();
  });

  test('keeps playing across navigation', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 0.5);

    await page.getByRole('complementary').getByRole('link', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

    const slider = bar(page).getByRole('slider', { name: 'Position in book' });
    const before = await slider.getAttribute('aria-valuetext');
    await expect(bar(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect.poll(() => slider.getAttribute('aria-valuetext')).not.toBe(before);
  });

  test('a reload brings the book back paused at the saved position, and Play continues from there', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play from 0:05' }).click();
    await waitForPosition(page, 7);
    await bar(page).getByRole('button', { name: 'Pause' }).click();
    const saved = await positionOf(page);

    await page.reload();
    await expect(live(page)).toContainText('status paused');
    expect(await positionOf(page)).toBeCloseTo(saved, 1);
    await expect(bar(page).getByText('Test book', { exact: true }).last()).toBeVisible();

    await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
    await waitForPosition(page, saved + 0.5);
    await expect(live(page)).toContainText('chapter 2');
  });

  test('a crash while playing loses at most the save interval', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 6.5); // past one 5 s periodic save and a chapter change

    await page.reload(); // no pause, no goodbye
    await expect(live(page)).toContainText('status paused');
    expect(await positionOf(page)).toBeGreaterThanOrEqual(5);
  });

  test('finishes at the end and plays again from the start', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play from 0:05' }).click();
    await bar(page).getByRole('slider', { name: 'Position in book' }).focus();
    await page.keyboard.press('End');

    await expect(live(page)).toContainText('status finished', { timeout: 15_000 });
    await bar(page).getByRole('button', { name: 'Play again' }).click();
    await expect(live(page)).toContainText('status playing');
    await expect(live(page)).toContainText('chapter 1');
  });

  test('skip, chapter jumps, seek and speed work from the bar', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 0.3);
    await bar(page).getByRole('button', { name: 'Pause' }).click();

    await bar(page).getByRole('button', { name: 'Next chapter' }).click();
    expect(await positionOf(page)).toBeCloseTo(6.03, 1);
    await bar(page).getByRole('button', { name: 'Forward 30 seconds' }).click();
    expect(await positionOf(page)).toBeCloseTo(16.11, 1); // clamped to the end of the book
    await bar(page).getByRole('button', { name: 'Back 15 seconds' }).click();
    expect(await positionOf(page)).toBeCloseTo(1.11, 1);
    await bar(page).getByRole('button', { name: 'Previous chapter' }).click();
    expect(await positionOf(page)).toBe(0);

    await bar(page).getByRole('button', { name: 'Playback speed' }).click();
    await expect(bar(page).getByRole('button', { name: 'Playback speed' })).toHaveText('1.25×');
    await expect(live(page)).toContainText('speed 1.25');
  });

  test('shows an error with the position kept when audio cannot load, and recovers on retry', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.route('**/dev/audio/*.mp3', (route) => route.abort());
    await page.getByRole('button', { name: 'Play from 0:05' }).click();

    await expect(bar(page).getByRole('alert')).toContainText("Couldn't load this chapter");
    await expect(bar(page).getByRole('alert')).toContainText('0:05');

    await page.unroute('**/dev/audio/*.mp3');
    await bar(page).getByRole('button', { name: 'Try again' }).click();
    await expect(live(page)).toContainText('status playing');
    await waitForPosition(page, 5.3);
  });

  test('only one tab plays at a time', async ({ context }) => {
    const first = await context.newPage();
    await first.goto('/dev/ui');
    await first.getByRole('button', { name: 'Play test book' }).click();
    await expect(live(first)).toContainText('status playing');

    const second = await context.newPage();
    await second.goto('/dev/ui');
    await second.getByRole('button', { name: 'Play from 0:05' }).click();
    await expect(live(second)).toContainText('status playing');

    await expect(live(first)).toContainText('status paused');
  });

  test('the home page lists the static books and a book page lists its chapters', async ({
    page,
  }) => {
    await open(page, '/');
    await expect(page.getByRole('article')).toHaveCount(4);

    await page.getByRole('link', { name: 'Сіддхартха, Герман Гессе' }).click();
    await expect(page).toHaveURL(/\/book\/hesse-siddhartha$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Сіддхартха' })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(12);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Play', exact: true }),
    ).toBeVisible();
  });
});
