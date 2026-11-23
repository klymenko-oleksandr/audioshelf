// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  MAX_COMPLETE_PARTS,
  parseBeginBody,
  parseCompleteBody,
  readJsonBody,
} from './request';

const SHA = 'ab12cd34'.repeat(8);
const book = {
  slug: 'a-book',
  title: 'A book',
  parts: [{ number: 1, title: 'One', file: '01.mp3', size: 10, sha256: SHA, durationSeconds: 5 }],
};

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/admin/import', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('readJsonBody', () => {
  it('reads a JSON body', async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: 1 })))).toEqual({
      ok: true,
      body: { a: 1 },
    });
  });

  it('accepts a charset on the content type', async () => {
    const res = await readJsonBody(
      post('{"a":1}', { 'content-type': 'application/json; charset=utf-8' }),
    );
    expect(res).toMatchObject({ ok: true });
  });

  it('answers 415 for any other content type, or none', async () => {
    for (const type of ['text/plain', 'multipart/form-data', '']) {
      const res = await readJsonBody(post('{}', { 'content-type': type }));
      expect(res, type).toMatchObject({ ok: false, status: 415, code: 'unsupported_media_type' });
    }
  });

  it('answers 400 for text that is not JSON, and for an empty body', async () => {
    expect(await readJsonBody(post('{nope'))).toMatchObject({
      ok: false,
      status: 400,
      code: 'invalid_json',
    });
    expect(await readJsonBody(post(''))).toMatchObject({ ok: false, status: 400 });
  });

  it('answers 413 for a body over the limit, by its declared size and by its real size', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await readJsonBody(post(big))).toMatchObject({ ok: false, status: 413 });
    expect(
      await readJsonBody(post('{}', { 'content-length': String(MAX_BODY_BYTES + 1) })),
    ).toMatchObject({ ok: false, status: 413, code: 'payload_too_large' });
  });

  it('counts bytes, not characters', async () => {
    const multiByte = JSON.stringify({ pad: 'ї'.repeat(MAX_BODY_BYTES / 2) });
    expect(await readJsonBody(post(multiByte))).toMatchObject({ ok: false, status: 413 });
  });
});

describe('parseBeginBody', () => {
  it('reads the book', () => {
    const res = parseBeginBody({ book });
    expect(res.ok && res.book.slug).toBe('a-book');
  });

  it('puts book problems under "book." and keeps their warnings', () => {
    const res = parseBeginBody({ book: { ...book, title: '', cover: 'c.jpg' } });
    expect(res).toMatchObject({ ok: false, errors: [{ path: 'book.title' }] });
    const ok = parseBeginBody({ book: { ...book, cover: 'c.jpg' } });
    expect(ok.ok && ok.warnings).toHaveLength(1);
  });

  it('needs a "book" and nothing else', () => {
    expect(parseBeginBody({})).toMatchObject({ ok: false, errors: [{ path: 'book' }] });
    expect(parseBeginBody(null)).toMatchObject({ ok: false, errors: [{ path: '' }] });
    expect(parseBeginBody({ book, publish: true })).toMatchObject({
      ok: false,
      errors: [{ path: 'publish' }],
    });
  });
});

describe('parseCompleteBody', () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    slug: 'a-book',
    parts: [{ number: 1 }],
    ...extra,
  });

  it('reads a list of parts, sorted, with publish off by default', () => {
    const res = parseCompleteBody(body({ parts: [{ number: 3 }, { number: 1 }] }));
    expect(res).toEqual({
      ok: true,
      value: { slug: 'a-book', publish: false, parts: [{ number: 1 }, { number: 3 }] },
    });
  });

  it('reads publish', () => {
    const res = parseCompleteBody(body({ publish: true }));
    expect(res.ok && res.value.publish).toBe(true);
    expect(parseCompleteBody(body({ publish: 'yes' }))).toMatchObject({ ok: false });
  });

  it('allows no parts at all, to publish a book whose parts are already ready', () => {
    expect(parseCompleteBody(body({ parts: [], publish: true }))).toMatchObject({ ok: true });
  });

  it('wants a valid slug and a list of parts', () => {
    for (const bad of [
      body({ slug: 'Not A Slug' }),
      body({ slug: undefined }),
      body({ parts: undefined }),
      body({ parts: 'x' }),
      body({ parts: [{}] }),
      body({ parts: [{ number: 0 }] }),
      body({ parts: [{ number: 1.5 }] }),
      body({ parts: [{ number: 1 }, { number: 1 }] }),
      body({ parts: [{ number: 1, extra: true }] }),
      body({ extra: true }),
    ]) {
      expect(parseCompleteBody(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
  });

  it('takes at most one batch of parts', () => {
    const many = Array.from({ length: MAX_COMPLETE_PARTS + 1 }, (_, i) => ({ number: i + 1 }));
    expect(parseCompleteBody(body({ parts: many }))).toMatchObject({ ok: false });
    expect(parseCompleteBody(body({ parts: many.slice(1) }))).toMatchObject({ ok: true });
  });

  it('wants an upload id and the ETags of a big file together, in part order', () => {
    const good = parseCompleteBody(
      body({ parts: [{ number: 1, uploadId: 'u1', etags: ['"a"', '"b"'] }] }),
    );
    expect(good).toMatchObject({
      ok: true,
      value: { parts: [{ number: 1, uploadId: 'u1', etags: ['"a"', '"b"'] }] },
    });
    for (const part of [
      { number: 1, uploadId: 'u1' },
      { number: 1, etags: ['"a"'] },
      { number: 1, uploadId: '', etags: ['"a"'] },
      { number: 1, uploadId: 'u1', etags: [] },
      { number: 1, uploadId: 'u1', etags: ['"a"', ''] },
      { number: 1, uploadId: 'u1', etags: [5] },
      { number: 1, uploadId: 5, etags: ['"a"'] },
    ]) {
      expect(parseCompleteBody(body({ parts: [part] })), JSON.stringify(part)).toMatchObject({
        ok: false,
      });
    }
  });
});
