// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import type { ImportStorage } from './data';
import { handleBegin, handleComplete, type ImportDeps } from './handlers';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const TOKEN = 'import-token-'.padEnd(48, 'q');
const SHA = 'ab12cd34'.repeat(8);

const storage = (): ImportStorage => ({
  singleUpload: vi.fn(async ({ key }) => ({
    url: `https://r2.test/${key}`,
    headers: { 'Content-Type': 'audio/mpeg' },
  })),
  openMultipart: vi.fn(async () => ({ uploadId: 'u1' })),
  partUrls: vi.fn(async () => []),
  completeMultipart: vi.fn(async () => {}),
  abortMultipart: vi.fn(async () => {}),
  head: vi.fn(async () => ({ size: 1000 })),
});

type Deps = ImportDeps & { db: Mock; readDb: Mock; revalidate: Mock };

function deps(overrides: Partial<ImportDeps> = {}): Deps {
  return {
    db: vi.fn(() => t.db),
    readDb: vi.fn(async (_label: string, run: (db: typeof t.db) => Promise<unknown>) => run(t.db)),
    storage: storage(),
    revalidate: vi.fn(),
    token: TOKEN,
    ...overrides,
  } as Deps;
}

const part = (number: number) => ({
  number,
  title: `Part ${number}`,
  file: `0${number}.mp3`,
  size: 1000,
  sha256: SHA,
  durationSeconds: 60,
});
const bookJson = (extra: Record<string, unknown> = {}) => ({
  slug: 'a-book',
  title: 'A book',
  author: 'An Author',
  narrator: 'A Narrator',
  category: 'fiction',
  parts: [part(1), part(2)],
  ...extra,
});

const call = (
  path: 'import' | 'import/complete',
  body: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
) =>
  new Request(`http://localhost/api/admin/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  await t.db.delete(schema.books);
  await t.db.delete(schema.authors);
  await t.db.delete(schema.narrators);
  await t.db.delete(schema.categories);
  await t.db.insert(schema.categories).values({ slug: 'fiction', nameUk: 'Художня' });
});

describe.each([
  ['begin', handleBegin, 'import'],
  ['complete', handleComplete, 'import/complete'],
] as const)('%s: the token, on every request', (_name, handler, path) => {
  it('answers 401 without a token, and touches nothing', async () => {
    const d = deps();
    const res = await handler(call(path, bookJson(), {}), d);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(d.db).not.toHaveBeenCalled();
    expect(d.readDb).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('answers 401 for a wrong token, a wrong scheme and a session cookie', async () => {
    const attempts: Record<string, string>[] = [
      { authorization: 'Bearer nope' },
      { authorization: TOKEN },
      { authorization: `Basic ${TOKEN}` },
      { cookie: 'admin_session=abc' },
    ];
    for (const headers of attempts) {
      const res = await handler(call(path, {}, headers), deps());
      expect(res.status, JSON.stringify(headers)).toBe(401);
    }
  });

  it('answers 401 when the token is not configured, whatever is sent', async () => {
    for (const token of [undefined, '', 'short']) {
      const res = await handler(
        call(path, {}, { authorization: `Bearer ${token ?? ''}` }),
        deps({ token }),
      );
      expect(res.status).toBe(401);
    }
  });

  it('checks the token before reading the body', async () => {
    const res = await handler(call(path, '{not json', {}), deps());
    expect(res.status).toBe(401);
  });

  it('keeps responses private and unindexable', async () => {
    const res = await handler(call(path, {}, {}), deps());
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
  });

  it('answers 415 for a body that is not JSON and 400 for text that does not parse', async () => {
    const wrongType = new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', authorization: `Bearer ${TOKEN}` },
      body: '{}',
    });
    expect((await handler(wrongType, deps())).status).toBe(415);
    expect((await handler(call(path, '{not json'), deps())).status).toBe(400);
  });
});

describe('POST /api/admin/import', () => {
  it('plans a new book: 200, a draft, an address for every part', async () => {
    const d = deps();
    const res = await handleBegin(call('import', { book: bookJson() }), d);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      book: { slug: 'a-book', status: 'draft', created: true },
      deferred: [],
      parts: [
        { number: 1, action: 'upload', key: 'books/a-book/audio/01-part-1-ab12cd34.mp3' },
        { number: 2, action: 'upload', key: 'books/a-book/audio/02-part-2-ab12cd34.mp3' },
      ],
    });
    expect(body.parts[0].upload).toMatchObject({ type: 'single', url: expect.any(String) });
    expect(d.revalidate).toHaveBeenCalledTimes(1);
    expect(d.readDb).toHaveBeenCalledWith('import:context', expect.any(Function));
  });

  it('does not echo the token', async () => {
    const res = await handleBegin(call('import', { book: bookJson() }), deps());
    expect(JSON.stringify(await res.json())).not.toContain(TOKEN);
  });

  it('answers 422 with a path for every problem in book.json, and writes nothing', async () => {
    const d = deps();
    const res = await handleBegin(
      call('import', { book: bookJson({ slug: 'Bad Slug', title: '', parts: [] }) }),
      d,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['book.slug', 'book.title', 'book.parts']),
    );
    expect(d.db).not.toHaveBeenCalled();
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('answers 422 for an unknown category, naming the known ones', async () => {
    const res = await handleBegin(
      call('import', { book: bookJson({ category: 'poetry' }) }),
      deps(),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: 'invalid_book',
      errors: [{ path: 'book.category', message: expect.stringContaining('fiction') }],
    });
  });

  it('answers 409 for a deleted book', async () => {
    await t.db.insert(schema.books).values({ slug: 'a-book', title: 'x', deletedAt: new Date() });
    const res = await handleBegin(call('import', { book: bookJson() }), deps());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'book_deleted' });
  });

  it('refreshes the catalogue when something was written, and only then', async () => {
    const d = deps();
    await handleBegin(call('import', { book: bookJson() }), d);
    await handleComplete(
      call('import/complete', { slug: 'a-book', parts: [{ number: 1 }, { number: 2 }] }),
      d,
    );
    d.revalidate.mockClear();

    const again = await handleBegin(call('import', { book: bookJson() }), d);
    expect((await again.json()).parts.map((p: { action: string }) => p.action)).toEqual([
      'skip',
      'skip',
    ]);
    expect(d.revalidate).not.toHaveBeenCalled();
  });

  it('keeps the details of a failure out of the answer, but refreshes the cache', async () => {
    const d = deps({
      db: vi.fn(() => {
        throw new Error('password=secret host=db.internal');
      }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleBegin(call('import', { book: bookJson() }), d);
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('internal_error');
    expect(text).not.toContain('secret');
    expect(d.revalidate).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/admin/import/complete', () => {
  it('finishes the parts: 200, ready, the book still a draft', async () => {
    const d = deps();
    await handleBegin(call('import', { book: bookJson() }), d);
    d.revalidate.mockClear();

    const res = await handleComplete(
      call('import/complete', { slug: 'a-book', parts: [{ number: 1 }, { number: 2 }] }),
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      book: { slug: 'a-book', status: 'draft' },
      parts: [
        { number: 1, status: 'ready' },
        { number: 2, status: 'ready' },
      ],
      publish: { requested: false },
    });
    expect(d.revalidate).toHaveBeenCalledTimes(1);
  });

  it('publishes when asked and the rules pass', async () => {
    const d = deps();
    await handleBegin(call('import', { book: bookJson() }), d);
    const res = await handleComplete(
      call('import/complete', {
        slug: 'a-book',
        parts: [{ number: 1 }, { number: 2 }],
        publish: true,
      }),
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      book: { status: 'published' },
      publish: { requested: true, published: true },
    });
  });

  it('answers 200 with the reason when the publish rules refuse: the parts are in', async () => {
    const d = deps();
    await handleBegin(call('import', { book: bookJson({ author: null }) }), d);
    const res = await handleComplete(
      call('import/complete', {
        slug: 'a-book',
        parts: [{ number: 1 }, { number: 2 }],
        publish: true,
      }),
      d,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      book: { status: 'draft' },
      publish: { requested: true, published: false, missing: ['author'] },
    });
  });

  it('answers 409 when a part could not be made ready', async () => {
    const d = deps();
    (d.storage.head as ReturnType<typeof vi.fn>).mockResolvedValue({ size: 5 });
    await handleBegin(call('import', { book: bookJson() }), d);
    const res = await handleComplete(
      call('import/complete', { slug: 'a-book', parts: [{ number: 1 }, { number: 2 }] }),
      d,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      ok: false,
      parts: [{ status: 'failed' }, { status: 'not_attempted' }],
    });
  });

  it('answers 404 for an unknown book, 409 for a deleted one and 422 for a bad request', async () => {
    const d = deps();
    const unknown = await handleComplete(call('import/complete', { slug: 'nope', parts: [] }), d);
    expect(unknown.status).toBe(404);

    await t.db.insert(schema.books).values({ slug: 'gone', title: 'x', deletedAt: new Date() });
    const gone = await handleComplete(call('import/complete', { slug: 'gone', parts: [] }), d);
    expect(gone.status).toBe(409);

    const bad = await handleComplete(call('import/complete', { slug: 'Bad Slug', parts: 5 }), d);
    expect(bad.status).toBe(422);
    expect((await bad.json()).errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['slug', 'parts']),
    );
  });
});
