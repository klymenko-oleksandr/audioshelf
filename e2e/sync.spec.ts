import { expect, test } from '@playwright/test';

// Read-only (Phase 6b): the sync routes as a guest sees them. Nothing here needs a session or a
// write to the database; the signed-in paths are covered by the handler tests on PGlite.
const PUSH = '/api/sync/push';
const PULL = '/api/sync/pull';
const BODY = {
  deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  deviceName: 'e2e',
  clientNow: Date.now(),
  changes: {},
};

function expectPrivateJson(res: { headers(): Record<string, string> }) {
  const headers = res.headers();
  expect(headers['content-type']).toContain('application/json');
  expect(headers['cache-control']).toBe('private, no-store, max-age=0');
  expect(headers['x-robots-tag']).toContain('noindex');
}

test.describe('sync routes without a session', () => {
  test('pull answers 401 JSON', async ({ request }) => {
    const res = await request.get(`${PULL}?since=0`);
    expect(res.status()).toBe(401);
    expectPrivateJson(res);
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized' });
  });

  test('push answers 401 JSON', async ({ request }) => {
    const res = await request.post(PUSH, { data: BODY });
    expect(res.status()).toBe(401);
    expectPrivateJson(res);
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized' });
  });

  test('a guest is told who they are before anything about the body', async ({ request }) => {
    const res = await request.post(PUSH, {
      headers: { 'content-type': 'text/plain' },
      data: 'not json',
    });
    expect(res.status()).toBe(401);
  });

  test('a cross-site push is refused before anything else', async ({ request }) => {
    const res = await request.post(PUSH, {
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      data: BODY,
    });
    expect(res.status()).toBe(403);
    expectPrivateJson(res);
  });

  test('the routes are not behind the admin gate and answer other methods with 405', async ({
    request,
  }) => {
    expect((await request.get(PUSH)).status()).toBe(405);
    expect((await request.post(PULL, { data: {} })).status()).toBe(405);
  });
});
