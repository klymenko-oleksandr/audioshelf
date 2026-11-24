// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { handlePull, handlePush, isSameOrigin, type SyncDeps, type SyncUser } from './handlers';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const NOW = 1_800_000_000_000;
const ALICE = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const PHONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORIGIN = 'https://audioshelf.example';
let BOOK: string;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.client.exec(`
    TRUNCATE sync_progress, sync_flags, sync_history, sync_settings, sync_devices, books CASCADE;
    DELETE FROM auth.users;
    INSERT INTO auth.users (id) VALUES ('${ALICE}');
  `);
  const [book] = await t.db
    .insert(schema.books)
    .values({ slug: 'one', title: 'One' })
    .returning({ id: schema.books.id });
  BOOK = book!.id;
});

const deps = (user: SyncUser | null = { id: ALICE }, extra: Partial<SyncDeps> = {}): SyncDeps => ({
  resolveUser: async () => user,
  db: () => t.db,
  readDb: (_label, run) => run(t.db),
  now: () => NOW,
  ...extra,
});

const body = (o: Record<string, unknown> = {}) => ({
  deviceId: PHONE,
  deviceName: 'Phone',
  clientNow: NOW,
  changes: {
    progress: [
      {
        bookId: BOOK,
        position: 12,
        duration: 600,
        speed: 1,
        finished: false,
        updatedAt: NOW - 100,
      },
    ],
  },
  ...o,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/sync/push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const get = (query = '') => new Request(`${ORIGIN}/api/sync/pull${query}`);

const expectPrivate = (res: Response) => {
  expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(res.headers.get('x-robots-tag')).toContain('noindex');
};

describe('POST /api/sync/push', () => {
  it('stores the changes and answers with the cursor and counts', async () => {
    const res = await handlePush(post(body()), deps());
    expect(res.status).toBe(200);
    expectPrivate(res);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      serverNow: NOW,
      cursor: expect.any(Number),
      applied: { progress: 1, flags: 0, history: 0, settings: 0 },
      dropped: [],
    });
    expect(json.cursor).toBeGreaterThan(0);
    const rows = await t.db.select().from(schema.syncProgress);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ALICE, bookId: BOOK, positionSeconds: 12 });
  });

  it('reports dropped items without failing the batch', async () => {
    const gone = '99999999-9999-4999-8999-999999999999';
    const res = await handlePush(
      post(
        body({
          changes: {
            progress: [
              {
                bookId: gone,
                position: 1,
                duration: 10,
                speed: 1,
                finished: false,
                updatedAt: NOW,
              },
            ],
          },
        }),
      ),
      deps(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).dropped).toEqual([
      { kind: 'progress', bookId: gone, reason: 'unknown_book' },
    ]);
  });

  it('accepts what navigator.sendBeacon sends: a JSON Blob, no custom headers', async () => {
    const res = await handlePush(
      new Request(`${ORIGIN}/api/sync/push`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify(body()),
      }),
      deps(),
    );
    expect(res.status).toBe(200);
  });

  it('401 JSON without a session, and nothing is read or stored', async () => {
    const res = await handlePush(post(body()), deps(null));
    expect(res.status).toBe(401);
    expectPrivate(res);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized' });
    expect(await t.db.select().from(schema.syncProgress)).toHaveLength(0);
  });

  it('401 comes before body checks: a guest learns nothing about the shape', async () => {
    const res = await handlePush(post('not json'), deps(null));
    expect(res.status).toBe(401);
  });

  it('403 for a cross-site request, before anything else', async () => {
    for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
      const res = await handlePush(post(body(), headers), deps());
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'forbidden' });
    }
    // Older browsers: no Sec-Fetch-Site, a foreign Origin.
    const req = new Request(`${ORIGIN}/api/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify(body()),
    });
    expect((await handlePush(req, deps())).status).toBe(403);
    expect(await t.db.select().from(schema.syncProgress)).toHaveLength(0);
  });

  it('415 for a body that is not JSON', async () => {
    const res = await handlePush(
      post('x=1', { 'content-type': 'application/x-www-form-urlencoded' }),
      deps(),
    );
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: 'unsupported_media_type' });
  });

  it('413 for a body over 1 MB, by the header and by the bytes', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(1024 * 1024 + 10) });
    const res = await handlePush(post(big), deps());
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: 'payload_too_large' });
  });

  it('400 for invalid JSON', async () => {
    const res = await handlePush(post('{ nope'), deps());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_json' });
  });

  it('422 with issues and paths for a body of the wrong shape', async () => {
    const res = await handlePush(
      post(body({ deviceId: 'nope', surprise: 1, changes: { progress: [{ bookId: 5 }] } })),
      deps(),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('invalid_request');
    const paths = json.errors.map((e: { path: string }) => e.path);
    expect(paths).toContain('deviceId');
    expect(paths.some((p: string) => p.startsWith('changes.progress[0]'))).toBe(true);
    expect(await t.db.select().from(schema.syncProgress)).toHaveLength(0);
  });

  it('500 JSON, nothing stored, when the database fails; no details leak', async () => {
    const res = await handlePush(
      post(body()),
      deps({ id: '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c' }),
    );
    expect(res.status).toBe(500);
    expectPrivate(res);
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, error: 'internal' });
    expect(JSON.stringify(json)).not.toMatch(/violates|foreign key|sync_/i);
    expect(await t.db.select().from(schema.syncProgress)).toHaveLength(0);
  });

  it('500 when the session lookup throws', async () => {
    const res = await handlePush(
      post(body()),
      deps(null, {
        resolveUser: async () => {
          throw new Error('auth down');
        },
      }),
    );
    expect(res.status).toBe(500);
  });
});

describe('GET /api/sync/pull', () => {
  it('answers with every row after the cursor, tagged with the writing device', async () => {
    await handlePush(post(body()), deps());
    const res = await handlePull(get('?since=0'), deps());
    expect(res.status).toBe(200);
    expectPrivate(res);
    expect(res.headers.get('vary')).toContain('Cookie');
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      serverNow: NOW,
      hasMore: false,
      flags: [],
      history: [],
      settings: [],
      devices: [{ id: PHONE, name: 'Phone', lastPushAt: NOW }],
    });
    expect(json.progress).toHaveLength(1);
    expect(json.progress[0]).toMatchObject({ bookId: BOOK, position: 12, deviceId: PHONE });
    expect(json.cursor).toBe(json.progress[0].seq);
    // From the cursor on there is nothing new.
    const again = await (await handlePull(get(`?since=${json.cursor}`), deps())).json();
    expect(again.progress).toEqual([]);
    expect(again.cursor).toBe(json.cursor);
  });

  it('since defaults to 0', async () => {
    await handlePush(post(body()), deps());
    expect((await (await handlePull(get(), deps())).json()).progress).toHaveLength(1);
  });

  it('notes that the asking device was seen', async () => {
    await handlePush(post(body()), deps());
    await handlePull(
      get(`?since=0&deviceId=${PHONE}`),
      deps({ id: ALICE }, { now: () => NOW + 9000 }),
    );
    const [device] = await t.db.select().from(schema.syncDevices);
    expect(device!.lastSeenAt.getTime()).toBe(NOW + 9000);
  });

  it('still answers when noting the device fails', async () => {
    await handlePush(post(body()), deps());
    const res = await handlePull(
      get(`?deviceId=${PHONE}`),
      deps(
        { id: ALICE },
        {
          db: () => {
            throw new Error('no writes');
          },
        },
      ),
    );
    expect(res.status).toBe(200);
  });

  it('401 JSON without a session', async () => {
    const res = await handlePull(get('?since=0'), deps(null));
    expect(res.status).toBe(401);
    expectPrivate(res);
    expect(await res.json()).toMatchObject({ ok: false, error: 'unauthorized' });
  });

  it('400 for a bad query, with issues', async () => {
    for (const query of ['?since=-1', '?since=abc', '?deviceId=nope', '?since=1&since=2', '?x=1']) {
      const res = await handlePull(get(query), deps());
      expect(res.status, query).toBe(400);
      expect((await res.json()).errors.length).toBeGreaterThan(0);
    }
  });

  it('500 when the read fails', async () => {
    const res = await handlePull(
      get(),
      deps(
        { id: ALICE },
        {
          readDb: async () => {
            throw new Error('db down');
          },
        },
      ),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'internal' });
  });
});

describe('isSameOrigin', () => {
  const req = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/sync/push`, { method: 'POST', headers });

  it('trusts Sec-Fetch-Site when present', () => {
    expect(isSameOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOrigin(req({ 'sec-fetch-site': 'none' }))).toBe(true);
    expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    // Sec-Fetch-Site wins over a matching Origin.
    expect(isSameOrigin(req({ 'sec-fetch-site': 'cross-site', origin: ORIGIN }))).toBe(false);
  });

  it('falls back to Origin against the host', () => {
    expect(isSameOrigin(req({ origin: ORIGIN, host: 'audioshelf.example' }))).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'audioshelf.example' }))).toBe(
      false,
    );
    expect(isSameOrigin(req({ origin: 'null' }))).toBe(false);
    expect(isSameOrigin(req({ origin: 'garbage' }))).toBe(false);
  });

  it('prefers the forwarded host behind a proxy', () => {
    expect(
      isSameOrigin(
        req({
          origin: 'https://app.example',
          host: 'internal:3000',
          'x-forwarded-host': 'app.example',
        }),
      ),
    ).toBe(true);
  });

  it('lets a request with neither header through (not a browser)', () => {
    expect(isSameOrigin(req({}))).toBe(true);
  });
});
