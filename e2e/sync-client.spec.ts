import { expect, test, type Page } from '@playwright/test';
import { waitForSaved } from './saved';
import { signIn } from './session';

// Read-only (Phase 6c): the sync client in a real browser. The two sync routes are answered
// here with `page.route` and never reach the server, and the session is faked, so nothing is
// written anywhere. The merge rules themselves are covered by the unit tests, which run the
// client against the server's own merge code.
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });

const TRY_TONY = '30000000-0000-4000-8000-000000000001';
const STARSHA = '30000000-0000-4000-8000-000000000002';
const OTHER_DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

interface Push {
  merge?: boolean;
  deviceId: string;
  deviceName: string;
  changes: {
    progress: { bookId: string; position: number }[];
    flags: { bookId: string; kind: string; deletedAt: number | null }[];
    history: { bookId: string }[];
  };
}

/** A pretend server: records pushes, and hands out whatever is queued on the next pull. */
async function fakeSync(page: Page) {
  const pushes: Push[] = [];
  const requests: string[] = [];
  let waiting: Record<string, object[]> = {};
  let seq = 0;

  await page.route('**/api/sync/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}`);
    const base = { ok: true, serverNow: Date.now() };
    if (request.method() === 'POST') {
      pushes.push(request.postDataJSON() as Push);
      await route.fulfill({ json: { ...base, cursor: seq, applied: {}, dropped: [] } });
      return;
    }
    const rows = waiting;
    waiting = {};
    seq += 1;
    await route.fulfill({
      json: {
        ...base,
        cursor: seq,
        hasMore: false,
        progress: [],
        flags: [],
        history: [],
        settings: [],
        devices: [],
        ...rows,
      },
    });
  });

  return {
    pushes,
    requests,
    /** Rows "another device" wrote, for the next pull. */
    send(rows: Record<string, object[]>) {
      waiting = rows;
    },
    flags: () => pushes.flatMap((push) => push.changes.flags),
  };
}

const flag = (bookId: string, deletedAt: number | null = null) => ({
  bookId,
  kind: 'like',
  addedAt: Date.now(),
  deletedAt,
  updatedAt: Date.now(),
  deviceId: OTHER_DEVICE,
  seq: 1,
});

async function like(page: Page, slug: string) {
  await page.goto(`/book/${slug}`);
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Like', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await waitForSaved(page, 'likes', 1);
}

const bookLink = (page: Page, title: string) =>
  page.getByRole('main').getByRole('link', { name: title, exact: true });

/** As when the listener comes back to the tab. */
const focus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

test('a guest sends and asks for nothing', async ({ page }) => {
  const server = await fakeSync(page);
  await like(page, 'try-tony');
  await page.goto('/library?tab=liked');
  await expect(bookLink(page, 'Три тони')).toBeVisible();
  await focus(page);
  await page.waitForTimeout(1000);
  expect(server.requests).toEqual([]);
});

test('signing in merges what the guest saved, then reads the account', async ({ page }) => {
  const server = await fakeSync(page);
  await like(page, 'try-tony');

  server.send({ flags: [flag(STARSHA)] });
  await signIn(page);
  await page.goto('/library?tab=liked');

  await expect(bookLink(page, 'Три тони')).toBeVisible();
  await expect(bookLink(page, 'Старша книга')).toBeVisible();
  expect(server.requests.slice(0, 2)).toEqual(['POST /api/sync/push', 'GET /api/sync/pull']);
  expect(server.pushes[0]).toMatchObject({ merge: true });
  expect(server.pushes[0]!.deviceName).toMatch(/ on /);
  expect(server.pushes[0]!.changes.flags).toMatchObject([{ bookId: TRY_TONY, kind: 'like' }]);
});

test('a change is pushed, and a pulled one appears in the open page', async ({ page }) => {
  const server = await fakeSync(page);
  await signIn(page);
  await like(page, 'try-tony');
  await expect.poll(() => server.flags().map((f) => f.bookId)).toContain(TRY_TONY);

  await page.goto('/library?tab=liked');
  await expect(bookLink(page, 'Три тони')).toBeVisible();
  await expect(bookLink(page, 'Старша книга')).toHaveCount(0);

  server.send({ flags: [flag(STARSHA)] });
  await focus(page);
  await expect(bookLink(page, 'Старша книга')).toBeVisible();

  server.send({ flags: [flag(STARSHA, Date.now() + 1000)] });
  await focus(page);
  await expect(bookLink(page, 'Старша книга')).toHaveCount(0);
});

test('a second tab picks up what the first one pulled', async ({ page, context }) => {
  const server = await fakeSync(page);
  await signIn(page);
  await page.goto('/library?tab=liked');
  const second = await context.newPage();
  await fakeSync(second);
  await second.route('http://localhost:54331/**', (route) => route.fulfill({ status: 204 }));
  await second.goto('/library?tab=liked');
  await expect(second.getByTestId('library-empty-liked')).toBeVisible();

  await page.bringToFront();
  server.send({ flags: [flag(STARSHA)] });
  await focus(page);
  await expect(bookLink(page, 'Старша книга')).toBeVisible();
  await expect(bookLink(second, 'Старша книга')).toBeVisible();
});

test('a position is pushed on pause', async ({ page }) => {
  const server = await fakeSync(page);
  await signIn(page);
  await page.goto('/book/try-tony');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: /Другий тон/ }).click();
  await expect(
    page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Pause' }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await main.getByRole('button', { name: 'Pause' }).click();

  await expect
    .poll(() => server.pushes.flatMap((p) => p.changes.progress).at(-1)?.position ?? 0)
    .toBeGreaterThan(0);
  expect(server.pushes.flatMap((p) => p.changes.progress).at(-1)!.bookId).toBe(TRY_TONY);
});

test('signing out leaves nothing of the account on the screen', async ({ page }) => {
  const server = await fakeSync(page);
  server.send({ flags: [flag(STARSHA)] });
  await signIn(page);
  await page.goto('/library?tab=liked');
  await expect(bookLink(page, 'Старша книга')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Continue with Google' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Library' }).first().click();
  await page.getByRole('tab', { name: /Liked/ }).click();
  await expect(page.getByTestId('library-empty-liked')).toBeVisible();
  await expect(page.getByTestId('library-count-liked')).toHaveText('0');
  await expect(page.getByTestId('library-count-history')).toHaveText('0');
});
