import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_IMPORT_TOKEN } from './fixtures/admin';
import {
  E2E_PREFIX,
  TARGETS_DEPLOYMENT,
  r2State,
  removeE2eRecords,
  withE2eSql,
} from './fixtures/e2e-records';
import { RUN, signIn } from './fixtures/track-card';

// The content import (Phase 4e): a script sends book.json, puts the audio straight into storage
// (the local stand-in, scripts/e2e-r2.mjs) and finishes the parts. No browser UI is involved,
// only the real routes, proxy, database and presigning. Never runs against a deployed site.
test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);
test.setTimeout(120_000);

const MB = 1024 * 1024;
const auth = { authorization: `Bearer ${ADMIN_IMPORT_TOKEN}` };
let counter = 0;
const newSlug = (name: string) => `e2e-import-${name}-${RUN}${counter++}`;

interface PartFile {
  number: number;
  bytes: Buffer;
}
const fileOf = (number: number, size = 1500): PartFile => ({
  number,
  bytes: Buffer.alloc(size, number),
});

function bookJson(slug: string, files: PartFile[], extra: Record<string, unknown> = {}) {
  return {
    slug,
    title: `${E2E_PREFIX}Import ${slug}`,
    author: `${E2E_PREFIX}Import Author`,
    narrator: `${E2E_PREFIX}Import Narrator`,
    category: 'fiction',
    description: 'Imported by the end-to-end test.',
    language: 'en',
    parts: files.map((f) => ({
      number: f.number,
      title: `Part ${f.number}`,
      file: `${String(f.number).padStart(2, '0')}.mp3`,
      size: f.bytes.length,
      sha256: createHash('sha256').update(f.bytes).digest('hex'),
      durationSeconds: 100,
    })),
    ...extra,
  };
}

type PartPlan = {
  number: number;
  action: string;
  trackId?: string;
  key?: string;
  upload?:
    | { type: 'single'; url: string; headers: Record<string, string> }
    | {
        type: 'multipart';
        uploadId: string;
        partSize: number;
        partCount: number;
        partUrls: string[];
      };
};
interface BeginBody {
  ok: boolean;
  book: { id: string; slug: string; status: string; created: boolean };
  parts: PartPlan[];
  deferred: number[];
  warnings: string[];
}

async function begin(request: APIRequestContext, book: object) {
  const res = await request.post('/api/admin/import', { headers: auth, data: { book } });
  return { res, body: (await res.json()) as BeginBody };
}

/** Sends one file where the plan says: one PUT, or the pieces of a multipart upload. */
async function send(request: APIRequestContext, plan: PartPlan, file: PartFile) {
  const upload = plan.upload!;
  if (upload.type === 'single') {
    const res = await request.put(upload.url, { headers: upload.headers, data: file.bytes });
    expect(res.status()).toBe(200);
    return {};
  }
  const etags: string[] = [];
  for (let i = 0; i < upload.partCount; i++) {
    const piece = file.bytes.subarray(i * upload.partSize, (i + 1) * upload.partSize);
    const res = await request.put(upload.partUrls[i]!, { data: piece });
    expect(res.status()).toBe(200);
    etags.push(res.headers()['etag']!);
  }
  return { uploadId: upload.uploadId, etags };
}

const complete = (request: APIRequestContext, slug: string, parts: object[], publish = false) =>
  request.post('/api/admin/import/complete', { headers: auth, data: { slug, parts, publish } });

const snapshot = (slug: string) =>
  withE2eSql(async (sql) => ({
    book: (
      await sql`select status, ongoing, duration_seconds, published_at from books where slug = ${slug}`
    )[0],
    tracks:
      await sql`select t.id, t.position, t.status, t.r2_key, t.updated_at from tracks t join books b on b.id = t.book_id where b.slug = ${slug} order by t.position`,
    chapters:
      await sql`select c.id, c.position, c.title, c.start_seconds, c.end_seconds, c.updated_at from chapters c join books b on b.id = c.book_id where b.slug = ${slug} order by c.position`,
  }));

test.describe('the token', () => {
  test('every request without the right token is refused with 401, even from a signed-in admin', async ({
    page,
    request,
  }) => {
    const slug = newSlug('auth');
    const body = { book: bookJson(slug, [fileOf(1)]) };
    for (const path of ['/api/admin/import', '/api/admin/import/complete']) {
      expect((await request.post(path, { data: body })).status()).toBe(401);
      expect(
        (
          await request.post(path, { headers: { authorization: 'Bearer wrong' }, data: body })
        ).status(),
      ).toBe(401);
    }
    // A browser session is not a token: the cookie opens the panel, never the import.
    await signIn(page);
    expect((await page.request.post('/api/admin/import', { data: body })).status()).toBe(401);
    expect((await snapshot(slug)).book).toBeUndefined();
  });

  test('the token opens the import and nothing else', async ({ request }) => {
    const res = await request.get('/api/admin/books', { headers: auth });
    expect(res.status()).toBe(401);
  });
});

test.describe('importing a book', () => {
  test('a new book is a draft: nothing is public until it is published', async ({ request }) => {
    const slug = newSlug('draft');
    const files = [fileOf(1), fileOf(2)];
    const { res, body } = await begin(request, bookJson(slug, files));

    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('no-store');
    expect(body).toMatchObject({ ok: true, book: { slug, status: 'draft', created: true } });
    expect(body.parts.map((p) => p.key)).toEqual([
      `books/${slug}/audio/01-part-1-${createHash('sha256').update(files[0]!.bytes).digest('hex').slice(0, 8)}.mp3`,
      `books/${slug}/audio/02-part-2-${createHash('sha256').update(files[1]!.bytes).digest('hex').slice(0, 8)}.mp3`,
    ]);

    for (const [i, plan] of body.parts.entries()) await send(request, plan, files[i]!);
    const done = await complete(request, slug, [{ number: 1 }, { number: 2 }]);
    expect(done.status()).toBe(200);
    expect(await done.json()).toMatchObject({
      ok: true,
      book: { status: 'draft' },
      parts: [{ status: 'ready' }, { status: 'ready' }],
      publish: { requested: false },
    });

    const rows = await snapshot(slug);
    expect(rows.book).toMatchObject({ status: 'draft', duration_seconds: 200, published_at: null });
    expect(rows.chapters.map((c) => [c.position, c.title, c.start_seconds, c.end_seconds])).toEqual(
      [
        [1, 'Part 1', 0, 100],
        [2, 'Part 2', 100, 200],
      ],
    );
    expect((await request.get(`/book/${slug}`)).status()).toBe(404); // a draft is not public
  });

  test('publishing happens only when asked and the rules pass', async ({ request }) => {
    const slug = newSlug('publish');
    const files = [fileOf(1)];
    const { body } = await begin(request, bookJson(slug, files));
    await send(request, body.parts[0]!, files[0]!);

    const done = await complete(request, slug, [{ number: 1 }], true);
    expect(done.status()).toBe(200);
    expect(await done.json()).toMatchObject({
      book: { status: 'published' },
      publish: { requested: true, published: true },
    });
    const page = await request.get(`/book/${slug}`);
    expect(page.status()).toBe(200);
    expect(await page.text()).toContain(`${E2E_PREFIX}Import ${slug}`);
  });

  test('when the publish rules fail the book stays a draft and the answer says what is missing', async ({
    request,
  }) => {
    const slug = newSlug('missing');
    const files = [fileOf(1)];
    const { body } = await begin(request, bookJson(slug, files, { author: null, narrator: null }));
    await send(request, body.parts[0]!, files[0]!);

    const done = await complete(request, slug, [{ number: 1 }], true);
    expect(done.status()).toBe(200);
    expect(await done.json()).toMatchObject({
      ok: true,
      book: { status: 'draft' },
      publish: { requested: true, published: false, missing: ['author', 'narrator'] },
    });
    expect((await snapshot(slug)).book!.status).toBe('draft');
  });

  test('a big file is sent in pieces, joined and made ready', async ({ request }) => {
    test.setTimeout(180_000);
    const slug = newSlug('big');
    const big = fileOf(1, 101 * MB);
    const { body } = await begin(request, bookJson(slug, [big]));
    expect(body.parts[0]!.upload).toMatchObject({
      type: 'multipart',
      partSize: 16 * MB,
      partCount: 7,
    });

    const sent = await send(request, body.parts[0]!, big);
    // Not finished without the pieces' ETags: the part stays as it is.
    const early = await complete(request, slug, [{ number: 1 }]);
    expect(early.status()).toBe(409);
    expect(await early.json()).toMatchObject({ parts: [{ status: 'needs_upload_info' }] });

    const done = await complete(request, slug, [{ number: 1, ...sent }]);
    expect(done.status()).toBe(200);
    expect(await done.json()).toMatchObject({ ok: true, parts: [{ status: 'ready' }] });
    expect(await r2State(slug)).toMatchObject({ open: 0, completed: 1, aborted: 0, partPuts: 7 });
  });
});

test.describe('importing again (ongoing books)', () => {
  test('appends only the new parts and leaves the existing parts and chapters untouched', async ({
    page,
    request,
  }) => {
    const slug = newSlug('ongoing');
    const files = [fileOf(1), fileOf(2), fileOf(3)];
    const first = await begin(request, bookJson(slug, files.slice(0, 2), { ongoing: true }));
    for (const [i, plan] of first.body.parts.entries()) await send(request, plan, files[i]!);
    await complete(request, slug, [{ number: 1 }, { number: 2 }], true);
    const before = await snapshot(slug);
    expect(before.book).toMatchObject({ status: 'published', ongoing: true });

    // The next part is out: the same book.json with one more part.
    const second = await begin(request, bookJson(slug, files, { ongoing: true }));
    expect(second.body.book).toMatchObject({ created: false, status: 'published' });
    expect(second.body.parts.map((p) => [p.number, p.action])).toEqual([
      [1, 'skip'],
      [2, 'skip'],
      [3, 'upload'],
    ]);
    await send(request, second.body.parts[2]!, files[2]!);
    const done = await complete(request, slug, [{ number: 3 }]);
    expect(done.status()).toBe(200);

    const after = await snapshot(slug);
    expect(after.tracks.slice(0, 2)).toEqual(before.tracks);
    expect(after.chapters.slice(0, 2)).toEqual(before.chapters);
    expect(after.chapters.map((c) => c.title)).toEqual(['Part 1', 'Part 2', 'Part 3']);
    expect(after.book).toMatchObject({ status: 'published', duration_seconds: 300 });
    expect(after.book!.published_at).toEqual(before.book!.published_at);

    // Listeners see three chapters, and the book is still marked as ongoing.
    await page.goto(`/book/${slug}`);
    await expect(page.getByText('Ongoing', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Part 3/ }).first()).toBeVisible();

    // The last part is out: the pipeline sends ongoing: false and the label goes.
    const last = await begin(request, bookJson(slug, files, { ongoing: false }));
    expect(last.body.parts.map((p) => p.action)).toEqual(['skip', 'skip', 'skip']);
    expect((await snapshot(slug)).book!.ongoing).toBe(false);
  });

  test('an interrupted import is picked up again with the same keys', async ({ request }) => {
    const slug = newSlug('resume');
    const files = [fileOf(1), fileOf(2)];
    const first = await begin(request, bookJson(slug, files));
    await send(request, first.body.parts[0]!, files[0]!);
    // The script dies here: part 1 was sent, part 2 never was, nothing was completed.

    const lost = await complete(request, slug, [{ number: 1 }, { number: 2 }]);
    expect(lost.status()).toBe(409);
    expect(await lost.json()).toMatchObject({
      ok: false,
      parts: [{ status: 'ready' }, { status: 'failed' }],
    });

    const again = await begin(request, bookJson(slug, files));
    expect(again.body.parts.map((p) => [p.number, p.action])).toEqual([
      [1, 'skip'],
      [2, 'upload'],
    ]);
    expect(again.body.parts[1]!.key).toBe(first.body.parts[1]!.key);
    await send(request, again.body.parts[1]!, files[1]!);
    const done = await complete(request, slug, [{ number: 2 }]);
    expect(done.status()).toBe(200);
    expect((await snapshot(slug)).tracks.map((t) => t.status)).toEqual(['ready', 'ready']);
  });
});

test.describe('refusing bad requests', () => {
  test('book.json problems come back with their paths and nothing is created', async ({
    request,
  }) => {
    const slug = newSlug('invalid');
    const bad = bookJson(slug, [fileOf(1)], {
      title: '',
      language: 'de',
      category: 'no-such-category',
    });
    const res = await request.post('/api/admin/import', { headers: auth, data: { book: bad } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(['book.title', 'book.language']),
    );
    expect((await snapshot(slug)).book).toBeUndefined();
  });

  test('an unknown category is refused with the known ones listed, and nothing is created', async ({
    request,
  }) => {
    const slug = newSlug('category');
    const res = await request.post('/api/admin/import', {
      headers: auth,
      data: { book: bookJson(slug, [fileOf(1)], { category: 'no-such-category' }) },
    });
    expect(res.status()).toBe(422);
    expect(await res.json()).toMatchObject({
      error: 'invalid_book',
      errors: [{ path: 'book.category', message: expect.stringContaining('fiction') }],
    });
    expect((await snapshot(slug)).book).toBeUndefined();
  });

  test('a body that is not JSON, or too large, is refused', async ({ request }) => {
    const text = await request.post('/api/admin/import', {
      headers: { ...auth, 'content-type': 'text/plain' },
      data: 'hello',
    });
    expect(text.status()).toBe(415);
    const big = await request.post('/api/admin/import', {
      headers: auth,
      data: { book: { pad: 'x'.repeat(300 * 1024) } },
    });
    expect(big.status()).toBe(413);
  });

  test('finishing a book that was never started answers 404', async ({ request }) => {
    const res = await complete(request, newSlug('nothing'), []);
    expect(res.status()).toBe(404);
  });
});
