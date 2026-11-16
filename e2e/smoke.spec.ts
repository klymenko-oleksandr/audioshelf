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
  });

  test('speed sheet: presets, steps and the slider set the speed', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await bar(page).getByRole('button', { name: 'Playback speed' }).click();

    const sheet = page.getByRole('dialog', { name: 'Playback speed' });
    await sheet.getByRole('button', { name: '1.25×' }).click();
    await expect(sheet.getByRole('button', { name: '1.25×' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(live(page)).toContainText('speed 1.25 ');

    await sheet.getByRole('button', { name: 'Faster' }).click();
    await expect(sheet.getByRole('status')).toHaveText('1.35×');
    await sheet.getByRole('slider', { name: 'Speed' }).focus();
    await page.keyboard.press('Home');
    await expect(live(page)).toContainText('speed 0.5 ');
    await expect(sheet.getByRole('button', { name: 'Slower' })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(bar(page).getByRole('button', { name: 'Playback speed' })).toHaveText('0.5×');
  });

  test('full-screen player: opens at #player, Back and the close button close it', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 0.3);

    await bar(page).getByRole('button', { name: 'Open player', exact: true }).click();
    const full = page.getByTestId('now-playing');
    await expect(full).toBeVisible();
    await expect(page).toHaveURL(/\/dev\/ui#player$/);
    await expect(full.getByTestId('chapter-title')).toHaveText('Tone 1');
    await expect(full.getByText('Chapter 1 of 3 · Three short tones')).toBeVisible();

    await full.getByRole('button', { name: 'Pause' }).click();
    await expect(live(page)).toContainText('status paused');
    await full.getByRole('button', { name: 'Next chapter' }).click();
    await expect(full.getByTestId('chapter-title')).toHaveText('Tone 2');

    await page.goBack();
    await expect(full).toBeHidden();
    await expect(page).toHaveURL(/\/dev\/ui$/);

    await bar(page).getByRole('button', { name: 'Open player', exact: true }).click();
    await full.getByRole('button', { name: 'Close player' }).click();
    await expect(full).toBeHidden();
    await expect(page).toHaveURL(/\/dev\/ui$/);

    // A reload with #player keeps it open; closing then leaves no stray history entry.
    await bar(page).getByRole('button', { name: 'Open player', exact: true }).click();
    await page.reload();
    await expect(full).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(full).toBeHidden();
    await expect(page).toHaveURL(/\/dev\/ui$/);
  });

  test('chapters sheet inside the full-screen player: jump to a chapter, Back closes only the sheet', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await bar(page).getByRole('button', { name: 'Pause' }).click();
    await bar(page).getByRole('button', { name: 'Open player', exact: true }).click();
    const full = page.getByTestId('now-playing');

    await full.getByRole('button', { name: 'Chapters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Chapters' });
    await expect(sheet.getByText('3 chapters')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Tone 1/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(full).toBeVisible();

    await full.getByRole('button', { name: 'Chapters' }).click();
    await sheet.getByRole('button', { name: /Tone 3/ }).click();
    await expect(sheet).toBeHidden();
    await expect(live(page)).toContainText('chapter 3');
    await expect(live(page)).toContainText('status playing');
    await expect(full.getByTestId('chapter-title')).toHaveText('Tone 3');
  });

  test('sleep timer: end of chapter stops at the chapter boundary; a manual pause cancels it', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 0.3);

    await bar(page).getByRole('button', { name: 'Sleep timer' }).click();
    const sheet = page.getByRole('dialog', { name: 'Sleep timer' });
    await sheet.getByRole('radio', { name: /End of chapter/ }).click();
    await expect(sheet).toBeHidden();
    await expect(live(page)).not.toContainText('sleep off');

    await expect(live(page)).toContainText('status paused', { timeout: 15_000 });
    expect(await positionOf(page)).toBeCloseTo(6.03, 1); // chapter 1 ends here
    await expect(live(page)).toContainText('sleep off');

    await bar(page).getByRole('button', { name: 'Play', exact: true }).click();
    await bar(page).getByRole('button', { name: 'Sleep timer' }).click();
    await sheet.getByRole('radio', { name: '15 minutes' }).click();
    await expect(
      bar(page).getByRole('button', { name: /Sleep timer, stops in 1[45]:/ }),
    ).toBeVisible();

    await bar(page)
      .getByRole('button', { name: /Sleep timer, stops in/ })
      .click();
    await expect(sheet.getByRole('radio', { name: '15 minutes' })).toBeChecked();
    await expect(sheet.getByTestId('sheet-note')).toContainText('Stops in 1');
    await page.keyboard.press('Escape');

    await bar(page).getByRole('button', { name: 'Pause' }).click();
    await expect(live(page)).toContainText('sleep off');
  });

  test('desktop full-screen player: inline speed presets and the sleep menu', async ({ page }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await bar(page).getByRole('button', { name: 'Open player', exact: true }).click();
    const full = page.getByTestId('now-playing');

    const speeds = full.getByRole('group', { name: 'Playback speed' });
    await speeds.getByRole('button', { name: '1.5×', exact: true }).click();
    await expect(speeds.getByRole('button', { name: '1.5×', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(live(page)).toContainText('speed 1.5 ');

    await full.getByRole('button', { name: 'Sleep timer' }).click();
    await page.getByRole('menuitemradio', { name: '30 minutes' }).click();
    await expect(
      full.getByRole('button', { name: /Sleep timer, stops in (30:00|29:)/ }),
    ).toBeVisible();
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(full).toBeVisible(); // the menu closed, the player did not

    await full.getByRole('button', { name: /Sleep timer, stops in/ }).click();
    await expect(page.getByRole('menuitemradio', { name: '30 minutes' })).toBeChecked();
    await page.getByRole('menuitemradio', { name: 'Off' }).click();
    await expect(full.getByRole('button', { name: 'Sleep timer', exact: true })).toBeVisible();
    await expect(live(page)).toContainText('sleep off');
  });

  test('phone full-screen player keeps the sheets', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE, locale: 'en-US' });
    const page = await context.newPage();
    await open(page, '/dev/ui', PHONE);
    await page.getByRole('button', { name: 'Play test book' }).click();
    await bar(page).getByRole('button', { name: 'Open player', exact: true }).first().click();
    const full = page.getByTestId('now-playing');

    await expect(full.getByRole('group', { name: 'Playback speed' })).toBeHidden();
    await full.getByRole('button', { name: 'Playback speed' }).click();
    await expect(page.getByRole('dialog', { name: 'Playback speed' })).toBeVisible();
    await context.close();
  });

  test('keyboard shortcuts: Space, arrows and Shift+arrows, but not while a control has focus', async ({
    page,
  }) => {
    await open(page, '/dev/ui');
    await page.getByRole('button', { name: 'Play test book' }).click();
    await waitForPosition(page, 0.3);
    await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus nothing in particular
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.keyboard.press('Space');
    await expect(live(page)).toContainText('status paused');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await positionOf(page)).toBeCloseTo(6.03, 1);
    await page.keyboard.press('ArrowRight');
    expect(await positionOf(page)).toBeCloseTo(16.11, 1);
    await page.keyboard.press('ArrowLeft');
    expect(await positionOf(page)).toBeCloseTo(1.11, 1);
    await page.keyboard.press('Shift+ArrowLeft');
    expect(await positionOf(page)).toBe(0);
    await page.keyboard.press('Space');
    await expect(live(page)).toContainText('status playing');

    // Space on a focused button presses that button and nothing else.
    await page.getByRole('button', { name: 'With Undo' }).focus();
    await page.keyboard.press('Space');
    await expect(live(page)).toContainText('status playing');
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
});

// Runs against the in-memory database from scripts/e2e-db.mjs (e2e/fixtures/catalogue.sql).
test.describe('catalogue', () => {
  test.use({ locale: 'en-US' });
  const player = (page: Page) => page.getByRole('region', { name: 'Player' });

  const row = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

  test('home: New releases newest first, a row per category, never a draft, no Continue row for a new visitor', async ({
    page,
  }) => {
    await open(page, '/');
    const fresh = row(page, 'New releases');
    await expect(fresh.getByRole('heading', { level: 2, name: 'New releases' })).toBeVisible();
    await expect(fresh.getByRole('article')).toHaveCount(2);
    await expect(fresh.getByRole('article').first()).toContainText('Три тони');
    await expect(fresh.getByRole('link', { name: 'Explore: New releases' })).toHaveAttribute(
      'href',
      '/explore',
    );

    const fiction = row(page, 'Fiction');
    await expect(fiction.getByRole('article')).toHaveCount(2);
    await expect(fiction.getByRole('link', { name: 'See all: Fiction' })).toHaveAttribute(
      'href',
      '/category/fiction',
    );
    // The ongoing book says so on its card.
    await expect(
      fresh.getByRole('article').filter({ hasText: 'Старша книга' }).getByText('Ongoing'),
    ).toBeVisible();

    await expect(page.getByText('Чернетка')).toHaveCount(0);
    await expect(row(page, 'Continue listening')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toHaveAttribute('aria-busy');
  });

  test('home rows are named in the interface language', async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP, locale: 'uk-UA' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(row(page, 'Новинки').getByRole('article')).toHaveCount(2);
    await expect(row(page, 'Художня література').getByRole('article')).toHaveCount(2);
    await context.close();
  });

  test('a book page shows the book from the database; drafts and unknown books are NotFound', async ({
    page,
  }) => {
    await open(page, '/');
    await row(page, 'New releases').getByRole('link', { name: 'Три тони, Леся Тестова' }).click();
    await expect(page).toHaveURL(/\/book\/try-tony$/);
    await expect(page).toHaveTitle(/Три тони/);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1, name: 'Три тони' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Леся Тестова' })).toHaveAttribute(
      'href',
      '/author/lesia-testova',
    );
    await expect(main.getByText('read by Остап Читець · 0 m · 3 chapters')).toBeVisible();
    await expect(main.getByRole('link', { name: 'Fiction' })).toHaveAttribute(
      'href',
      '/category/fiction',
    );
    await expect(main.getByText('Ukrainian', { exact: true })).toBeVisible();
    // Desktop: About sits beside the chapters, so both are on screen and there is no About tab.
    await expect(
      main.getByText('Коротка книга з трьох тонів').filter({ visible: true }),
    ).toHaveCount(1);
    await expect(main.getByRole('listitem')).toHaveCount(3);
    await expect(main.getByRole('tab', { name: 'About' })).toBeHidden();
    await expect(main.getByRole('tab', { name: 'Chapters · 3' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // A new visitor has no progress: plain Play, every chapter numbered.
    await expect(main.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    for (const slug of ['chernetka', 'no-such-book']) {
      const response = await page.goto(`/book/${slug}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
    }
  });

  test('book page on a phone: About is a tab kept in the URL; Reviews is marked Soon', async ({
    page,
  }) => {
    await open(page, '/book/try-tony?tab=about', PHONE);
    const main = page.getByRole('main');
    const about = main.getByRole('tab', { name: 'About' });
    const chapters = main.getByRole('tab', { name: 'Chapters · 3' });
    await expect(about).toHaveAttribute('aria-selected', 'true');
    await expect(
      main.getByText('Коротка книга з трьох тонів').filter({ visible: true }),
    ).toHaveCount(1);
    await expect(main.getByRole('listitem').first()).toBeHidden();

    await chapters.click();
    await expect(main.getByRole('listitem')).toHaveCount(3);
    await expect(
      main.getByText('Коротка книга з трьох тонів').filter({ visible: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).search).toBe('');

    await about.click();
    expect(new URL(page.url()).searchParams.get('tab')).toBe('about');
    await page.reload();
    await expect(about).toHaveAttribute('aria-selected', 'true');

    await expect(main.getByRole('tab', { name: /Reviews/ })).toBeDisabled();
    await expect(main.getByRole('tab', { name: /Reviews/ })).toContainText('Soon');

    // Features that are not built yet say so instead of doing nothing.
    await main.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByRole('status').getByText("This isn't available yet")).toBeVisible();
  });

  test('an ongoing book is labelled, and a book without a description says so', async ({
    page,
  }) => {
    await open(page, '/book/starsha-knyha');
    const main = page.getByRole('main');
    await expect(main.getByText('Ongoing · more parts coming')).toBeVisible();
    await expect(main.getByText('No description yet.').filter({ visible: true })).toHaveCount(1);
  });

  test('progress: the book page offers Resume at the chapter, Home gets a Continue listening row', async ({
    page,
  }) => {
    await open(page, '/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: /Другий тон/ }).click();
    await expect(player(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.waitForTimeout(1200);
    await main.getByRole('button', { name: 'Pause' }).click();

    // Chapters before the current one are finished; the button names where Resume goes.
    await expect(main.getByRole('button', { name: /Resume · Ch\. 2, 0:0\d/ })).toBeVisible();
    await expect(main.getByRole('button', { name: /Перший тон/ })).toContainText('Finished');
    await expect(main.getByRole('button', { name: /Другий тон/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(main.getByText(/^\d+% · .+ left$/)).toBeVisible();

    await page.goto('/');
    const cont = row(page, 'Continue listening');
    const card = cont.getByRole('article');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Три тони');
    await expect(card).toContainText('Ch. 2 of 3');
    await expect(cont.getByRole('link', { name: 'See all: Continue listening' })).toHaveAttribute(
      'href',
      '/library',
    );
    // The row sits above New releases.
    const contBox = await cont.boundingBox();
    const freshBox = await row(page, 'New releases').boundingBox();
    expect(contBox && freshBox && contBox.y < freshBox.y).toBe(true);

    await card.getByRole('button', { name: 'Resume Три тони' }).click();
    await expect(card.getByRole('button', { name: 'Pause Три тони' })).toBeVisible();
    await expect(
      player(page)
        .getByText(/Другий тон/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await card.getByRole('button', { name: 'Pause Три тони' }).click();

    // The card itself opens the book.
    await card.getByRole('link', { name: 'Три тони' }).click();
    await expect(page).toHaveURL(/\/book\/try-tony$/);
  });

  test('a finished book leaves Continue listening and its page offers Play again', async ({
    page,
  }) => {
    await open(page, '/book/starsha-knyha');
    await page.goto('/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: /Третій тон/ }).click();
    await player(page).getByRole('slider', { name: 'Position in book' }).focus();
    await page.keyboard.press('End');
    await expect(main.getByRole('button', { name: 'Play again' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(main.getByText('Finished', { exact: true }).first()).toBeVisible();

    await page.goto('/');
    await expect(row(page, 'New releases')).toBeVisible();
    await expect(row(page, 'Continue listening')).toHaveCount(0);
  });

  test('home and the book page do not overflow sideways at any width', async ({ page }) => {
    for (const path of ['/', '/book/try-tony', '/book/try-tony?tab=about']) {
      for (const size of [PHONE, TABLET, { width: 1024, height: 768 }, DESKTOP]) {
        await open(page, path, size);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow on ${path} at ${size.width}px`).toBe(0);
      }
    }
  });

  test('Play on the book page loads the tracks and plays; a chapter starts from its beginning', async ({
    page,
  }) => {
    await open(page, '/book/try-tony');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(player(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(main.getByRole('button', { name: /Перший тон/ })).toHaveAttribute(
      'aria-current',
      'true',
    );

    await main.getByRole('button', { name: /Третій тон/ }).click();
    await expect(main.getByRole('button', { name: /Третій тон/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await expect(player(page).getByText('Третій тон').first()).toBeVisible();
  });

  test('a book started from a card comes back after a reload, fetched from the server again', async ({
    page,
  }) => {
    await open(page, '/');
    const card = row(page, 'New releases').getByRole('article').filter({ hasText: 'Три тони' });
    await card.hover();
    await card.getByRole('button', { name: /^Play/ }).click();
    await expect(player(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.waitForTimeout(1200);
    await player(page).getByRole('button', { name: 'Pause' }).click();

    await page.reload();
    await expect(player(page).getByText('Три тони', { exact: true }).last()).toBeVisible();
    await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  });

  test('the player API answers 404 for drafts, unknown ids and junk', async ({ request }) => {
    const ok = await request.get('/api/player/books/30000000-0000-4000-8000-000000000001');
    expect(ok.status()).toBe(200);
    const book = await ok.json();
    expect(book.tracks).toHaveLength(3);
    expect(book.tracks[0].url).toMatch(/\/dev\/audio\/tone-1\.mp3$/);

    for (const id of ['30000000-0000-4000-8000-000000000003', 'test-book', 'x%27%3B--']) {
      expect((await request.get(`/api/player/books/${id}`)).status()).toBe(404);
    }
  });

  test('the books API returns card data for live books only', async ({ request }) => {
    const ids = [
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003', // draft
      'junk',
    ].join(',');
    const response = await request.get(`/api/catalogue/books?ids=${ids}`);
    expect(response.status()).toBe(200);
    const { books } = await response.json();
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ slug: 'try-tony', chapterStarts: [0, 6.03, 12.06] });
    expect(books[0].tracks).toBeUndefined();

    expect((await (await request.get('/api/catalogue/books')).json()).books).toEqual([]);
  });
});
