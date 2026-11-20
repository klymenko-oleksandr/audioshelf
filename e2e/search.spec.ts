import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 1024 };

async function open(page: Page, path: string, size = DESKTOP) {
  await page.setViewportSize(size);
  await page.goto(path);
}

const searchParam = (page: Page) => new URL(page.url()).searchParams.get('q');

test.describe('search', () => {
  test.use({ locale: 'en-US' });

  test('typing in the top bar searches after a pause and keeps focus', async ({ page }) => {
    await open(page, '/');
    const field = page.getByRole('searchbox', { name: 'Search' });
    await field.click();
    await page.keyboard.type('тон', { delay: 30 });
    await expect(page).toHaveURL(/\/search\?q=/);
    expect(searchParam(page)).toBe('тон');
    await expect(page.getByRole('heading', { name: 'Top result' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Три тони/ }).first()).toBeVisible();
    await expect(field).toBeFocused();
  });

  test('an inflected word still finds the book', async ({ page }) => {
    await open(page, '/search?q=старшої');
    await expect(page.getByRole('link', { name: /Старша книга/ }).first()).toBeVisible();
  });

  test('an author name finds their books and the author', async ({ page }) => {
    await open(page, '/search?q=Лес');
    await expect(page.getByRole('link', { name: /Старша книга/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Леся Тестова/ }).first()).toBeVisible();
  });

  test('tabs narrow the results through the URL', async ({ page }) => {
    await open(page, '/search?q=Лес');
    await page
      .getByRole('navigation', { name: 'Search results' })
      .getByRole('link', { name: /^Authors/ })
      .click();
    await expect(page).toHaveURL(/tab=authors/);
    await expect(page.getByRole('link', { name: /Леся Тестова/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Старша книга/ })).toHaveCount(0);
  });

  test('no results shows the empty state with categories, and drafts are never found', async ({
    page,
  }) => {
    await open(page, '/search?q=zzzzzz');
    await expect(page.getByText('No results for “zzzzzz”')).toBeVisible();
    await expect(page.getByRole('link', { name: /Fiction/ }).first()).toBeVisible();

    await page.goto('/search?q=Чернетка');
    await expect(page.getByText('No results for “Чернетка”')).toBeVisible();
    await page.goto('/search?q=Чернеток');
    await expect(page.getByRole('link', { name: /Автор Чернеток/ })).toHaveCount(0);
  });

  test('refining replaces the history entry instead of stacking them', async ({ page }) => {
    await open(page, '/search?q=тони');
    const field = page.getByRole('searchbox', { name: 'Search' });
    await field.fill('старша');
    await expect(page).toHaveURL(/q=%D1%81%D1%82%D0%B0%D1%80%D1%88%D0%B0/);
    await page.goBack();
    expect(new URL(page.url()).pathname).not.toBe('/search');
  });

  test('the top result plays the book', async ({ page }) => {
    await open(page, '/search?q=Три тони');
    await page
      .getByRole('region', { name: 'Top result' })
      .getByRole('button', { name: 'Play', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Pause' }).first()).toBeVisible();
  });

  test('recent searches appear, run again and clear', async ({ page }) => {
    await open(page, '/search');
    const field = page.getByRole('searchbox', { name: 'Search' }).last();
    await field.fill('тони');
    await field.press('Enter');
    await expect(page).toHaveURL(/q=/);
    await page.goto('/search');
    const chip = page
      .getByRole('button', { name: 'Search again: тони' })
      .or(page.getByRole('link', { name: 'Search again: тони' }));
    await expect(chip.first()).toBeVisible();
    await chip.first().click();
    await expect(page).toHaveURL(/q=%D1%82%D0%BE%D0%BD%D0%B8/);
    await page.goto('/search');
    await page.getByRole('button', { name: 'Clear recent searches' }).click();
    await expect(page.getByRole('button', { name: 'Search again: тони' })).toHaveCount(0);
  });

  test('phone Explore launcher submits to search', async ({ page }) => {
    await open(page, '/explore', PHONE);
    const field = page.getByRole('searchbox').first();
    await field.fill('тони');
    await field.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole('link', { name: /Три тони/ }).first()).toBeVisible();
  });
});

test.describe('share', () => {
  test.use({ locale: 'en-US' });

  test('uses the native share sheet when there is one', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      navigator.share = async (data) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
      };
    });
    await open(page, '/book/try-tony');
    await page.getByRole('button', { name: 'Share' }).first().click();
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: { url: string }[] }).__shared,
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]?.url).toMatch(/\/book\/try-tony$/);
  });

  test('falls back to copying the link with a toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    await open(page, '/book/try-tony');
    await page.getByRole('button', { name: 'Share' }).first().click();
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/book\/try-tony$/);
  });

  test('the author page has a Share button', async ({ page }) => {
    await open(page, '/search?q=Лес');
    await page
      .getByRole('link', { name: /Леся Тестова/ })
      .first()
      .click();
    await expect(page.getByRole('button', { name: 'Share' }).first()).toBeVisible();
  });
});

test.describe('favicon and generated images', () => {
  test('favicon routes exist and are linked from the head', async ({ page, request }) => {
    for (const path of ['/icon.svg', '/apple-icon.png', '/favicon.ico']) {
      expect((await request.get(path)).status(), path).toBe(200);
    }
    await page.goto('/');
    await expect(page.locator('head link[rel="icon"]').first()).toHaveAttribute('href', /icon/);
    await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveCount(1);
  });

  test('book pages carry Open Graph metadata and a PNG share image', async ({ page, request }) => {
    await page.goto('/book/try-tony');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Три тони/);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    // Next adds a hash to the image address (`opengraph-image-<hash>`); follow the page's own link.
    const href = await page.locator('meta[property="og:image"]').getAttribute('content');
    const path = new URL(href!).pathname;
    expect(path).toMatch(/^\/book\/try-tony\/opengraph-image/);
    const og = await request.get(path);
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    expect((await request.get(path.replace('/try-tony/', '/no-such-book/'))).status()).toBe(404);
  });

  test('the lock-screen cover is a PNG for live books only', async ({ request }) => {
    const ok = await request.get('/api/cover/try-tony');
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-type']).toContain('image/png');
    expect((await request.get('/api/cover/chernetka')).status()).toBe(404);
  });

  test('cards draw the typographic cover even when a book has cover images', async ({ page }) => {
    await open(page, '/search?q=Три тони');
    await expect(page.getByRole('link', { name: /Три тони/ }).first()).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
  });
});
