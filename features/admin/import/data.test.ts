// @vitest-environment node
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import type { ImportBook, ImportPart } from './book-json';
import {
  beginImport,
  completeImport,
  loadImportContext,
  type BeginImportResult,
  type ImportStorage,
} from './data';
import type { CompleteRequest } from './request';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const MB = 1024 * 1024;
const HASH = 'ab12cd34'.repeat(8);

function fakeStorage(overrides: Partial<ImportStorage> = {}) {
  const sizes = new Map<string, number>();
  const base = {
    singleUpload: vi.fn(async ({ key }: { key: string }) => ({
      url: `https://r2.test/${key}?sig=1`,
      headers: { 'Content-Type': 'audio/mpeg' },
    })),
    openMultipart: vi.fn(async () => ({ uploadId: 'upload-1' })),
    partUrls: vi.fn(async ({ partCount }: { partCount: number }) =>
      Array.from({ length: partCount }, (_, i) => `https://r2.test/part/${i + 1}`),
    ),
    completeMultipart: vi.fn(async () => {}),
    abortMultipart: vi.fn(async () => {}),
    // By default every object exists with exactly the size the track declared.
    head: vi.fn(async (key: string) => ({ size: sizes.get(key) ?? SIZE_OF.get(key) ?? 1000 })),
  };
  // `overrides` replace whole methods; the result keeps the mock types of `base`.
  const storage = { ...base, ...overrides } as typeof base;
  return { storage, sizes };
}
const SIZE_OF = new Map<string, number>();

const part = (number: number, extra: Partial<ImportPart> = {}): ImportPart => ({
  number,
  title: `Part ${number}`,
  file: `${String(number).padStart(2, '0')}.mp3`,
  size: 1000,
  sha256: HASH,
  durationSeconds: 100,
  ...extra,
});

const book = (extra: Partial<ImportBook> = {}): ImportBook => ({
  slug: 'hesse-siddhartha',
  title: 'Siddhartha',
  author: 'Hermann Hesse',
  narrator: 'A. Reader',
  category: 'fiction',
  description: 'A novel.',
  language: 'en',
  ongoing: false,
  parts: [part(1), part(2)],
  ...extra,
});

async function begin(
  storage: ImportStorage,
  value: ImportBook,
): Promise<Extract<BeginImportResult, { ok: true }>> {
  const ctx = await loadImportContext(t.db, value.slug);
  const result = await beginImport(t.db, storage, ctx, value);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

const complete = (
  storage: ImportStorage,
  request: Partial<CompleteRequest> & { parts: CompleteRequest['parts'] },
) => completeImport(t.db, storage, { slug: 'hesse-siddhartha', publish: false, ...request });

const rowsOf = async (slug = 'hesse-siddhartha') => {
  const [b] = await t.db.select().from(schema.books).where(eq(schema.books.slug, slug));
  const trackRows = b
    ? await t.db
        .select()
        .from(schema.tracks)
        .where(eq(schema.tracks.bookId, b.id))
        .orderBy(asc(schema.tracks.position))
    : [];
  const chapterRows = b
    ? await t.db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, b.id))
        .orderBy(asc(schema.chapters.position))
    : [];
  return { book: b, tracks: trackRows, chapters: chapterRows };
};

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  SIZE_OF.clear();
  await t.db.delete(schema.books);
  await t.db.delete(schema.authors);
  await t.db.delete(schema.narrators);
  await t.db.delete(schema.categories);
  await t.db.insert(schema.categories).values({ slug: 'fiction', nameUk: 'Художня' });
});

describe('beginImport: a new book', () => {
  it('creates a draft under the slug from book.json, with the people and category resolved', async () => {
    const { storage } = fakeStorage();
    const result = await begin(storage, book());

    expect(result.book).toMatchObject({ slug: 'hesse-siddhartha', status: 'draft', created: true });
    expect(result.changed).toBe(true);
    const rows = await rowsOf();
    expect(rows.book).toMatchObject({
      title: 'Siddhartha',
      status: 'draft',
      language: 'en',
      ongoing: false,
      description: 'A novel.',
    });
    expect(rows.book!.authorId && rows.book!.narratorId && rows.book!.categoryId).toBeTruthy();
    expect((await t.db.select().from(schema.authors))[0]).toMatchObject({
      name: 'Hermann Hesse',
      bio: null,
    });
  });

  it('adds each part as uploading, with the readable key and a presigned address', async () => {
    const { storage } = fakeStorage();
    const result = await begin(storage, book());

    expect(result.parts).toEqual([
      {
        number: 1,
        action: 'upload',
        trackId: expect.any(String),
        key: 'books/hesse-siddhartha/audio/01-part-1-ab12cd34.mp3',
        upload: {
          type: 'single',
          url: 'https://r2.test/books/hesse-siddhartha/audio/01-part-1-ab12cd34.mp3?sig=1',
          headers: { 'Content-Type': 'audio/mpeg' },
        },
      },
      expect.objectContaining({
        number: 2,
        key: 'books/hesse-siddhartha/audio/02-part-2-ab12cd34.mp3',
      }),
    ]);
    const { tracks } = await rowsOf();
    expect(tracks.map((x) => [x.position, x.title, x.status, x.originalFilename])).toEqual([
      [1, 'Part 1', 'uploading', '01.mp3'],
      [2, 'Part 2', 'uploading', '02.mp3'],
    ]);
  });

  it('opens a multipart upload for a file over 100 MB, with one address per piece', async () => {
    const { storage } = fakeStorage();
    const result = await begin(storage, book({ parts: [part(1, { size: 101 * MB })] }));

    expect(storage.openMultipart).toHaveBeenCalledOnce();
    expect(result.parts[0]).toMatchObject({
      action: 'upload',
      upload: {
        type: 'multipart',
        uploadId: 'upload-1',
        partSize: 16 * MB,
        partCount: 7,
        partUrls: expect.arrayContaining(['https://r2.test/part/1', 'https://r2.test/part/7']),
      },
    });
    expect(storage.singleUpload).not.toHaveBeenCalled();
  });

  it('uses an M4A content type for an .m4a file', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book({ parts: [part(1, { file: '01.m4a' })] }));
    expect(storage.singleUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'audio/mp4' }),
    );
  });

  it('saves an incomplete draft: only the slug, title and parts are needed', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book({ author: null, narrator: null, category: null, description: null }));
    expect((await rowsOf()).book).toMatchObject({
      authorId: null,
      narratorId: null,
      categoryId: null,
    });
  });

  it('uses an existing author and narrator whatever the case and spacing, and leaves the bio alone', async () => {
    const [author] = await t.db
      .insert(schema.authors)
      .values({ slug: 'hermann-hesse', name: 'Hermann Hesse', bio: 'Born in Calw.' })
      .returning();
    await t.db.insert(schema.narrators).values({ slug: 'a-reader', name: 'A. Reader' });
    const { storage } = fakeStorage();

    await begin(storage, book({ author: 'hermann   HESSE', narrator: 'a. reader' }));

    expect(await t.db.select().from(schema.authors)).toHaveLength(1);
    expect(await t.db.select().from(schema.narrators)).toHaveLength(1);
    expect((await rowsOf()).book!.authorId).toBe(author!.id);
    expect((await t.db.select().from(schema.authors))[0]!.bio).toBe('Born in Calw.');
  });

  it('refuses an unknown category, listing the known ones, and writes nothing', async () => {
    const { storage } = fakeStorage();
    const ctx = await loadImportContext(t.db, 'hesse-siddhartha');
    const result = await beginImport(t.db, storage, ctx, book({ category: 'poetry' }));

    expect(result).toMatchObject({
      ok: false,
      reason: 'invalid',
      errors: [{ path: 'book.category', message: expect.stringContaining('fiction') }],
    });
    expect((await rowsOf()).book).toBeUndefined();
    expect(await t.db.select().from(schema.authors)).toHaveLength(0);
  });

  it('says slug_taken when another request created the slug between the look and the write', async () => {
    const { storage } = fakeStorage();
    const ctx = await loadImportContext(t.db, 'hesse-siddhartha'); // book not there yet
    await t.db.insert(schema.books).values({ slug: 'hesse-siddhartha', title: 'Other' });
    expect(await beginImport(t.db, storage, ctx, book())).toEqual({
      ok: false,
      reason: 'slug_taken',
    });
    expect(await t.db.select().from(schema.authors)).toHaveLength(0);
  });

  it('refuses a soft-deleted book instead of creating a duplicate', async () => {
    await t.db
      .insert(schema.books)
      .values({ slug: 'hesse-siddhartha', title: 'Old', deletedAt: new Date() });
    const { storage } = fakeStorage();
    const ctx = await loadImportContext(t.db, 'hesse-siddhartha');
    expect(await beginImport(t.db, storage, ctx, book())).toEqual({
      ok: false,
      reason: 'book_deleted',
    });
    expect(await t.db.select().from(schema.books)).toHaveLength(1);
  });

  it('marks the part failed and stops when presigning fails', async () => {
    const { storage } = fakeStorage({
      singleUpload: vi.fn(async () => {
        throw new Error('storage down');
      }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await begin(storage, book());

    expect(result.parts).toEqual([
      { number: 1, action: 'error', message: expect.stringContaining('Could not prepare') },
    ]);
    expect(result.deferred).toEqual([2]);
    expect((await rowsOf()).tracks.map((x) => x.status)).toEqual(['failed']);
  });

  it('hands out a batch of parts and defers the rest', async () => {
    const { storage } = fakeStorage();
    const many = Array.from({ length: 30 }, (_, i) => part(i + 1));
    const result = await begin(storage, book({ parts: many }));
    expect(result.parts).toHaveLength(25);
    expect(result.deferred).toEqual([26, 27, 28, 29, 30]);
  });
});

describe('completeImport', () => {
  it('checks each file in storage, makes the parts ready, builds the chapters and the length', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book());
    const result = await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });

    expect(result).toMatchObject({
      ok: true,
      allReady: true,
      book: { status: 'draft' },
      parts: [
        { number: 1, status: 'ready' },
        { number: 2, status: 'ready' },
      ],
      publish: { requested: false },
      changed: true,
    });
    const rows = await rowsOf();
    expect(rows.tracks.map((x) => x.status)).toEqual(['ready', 'ready']);
    expect(rows.chapters.map((c) => [c.position, c.title, c.startSeconds, c.endSeconds])).toEqual([
      [1, 'Part 1', 0, 100],
      [2, 'Part 2', 100, 200],
    ]);
    expect(rows.book!.durationSeconds).toBe(200);
    expect(rows.book!.status).toBe('draft'); // a draft by default
  });

  it('can be repeated: a part that is already ready is reported, not redone', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book());
    await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });
    const again = await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });
    expect(again).toMatchObject({
      ok: true,
      allReady: true,
      parts: [
        { number: 1, status: 'already_ready' },
        { number: 2, status: 'already_ready' },
      ],
    });
    expect((await rowsOf()).chapters).toHaveLength(2);
  });

  it('fails a part whose stored size differs, and attempts nothing after it', async () => {
    const { storage, sizes } = fakeStorage();
    const first = await begin(storage, book());
    sizes.set((first.parts[0] as { key: string }).key, 999);
    const result = await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });

    expect(result).toMatchObject({
      ok: true,
      allReady: false,
      parts: [
        { number: 1, status: 'failed', message: expect.stringContaining('999') },
        { number: 2, status: 'not_attempted' },
      ],
    });
    expect((await rowsOf()).tracks.map((x) => x.status)).toEqual(['failed', 'uploading']);
  });

  it('says so when a part was never started', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book({ parts: [part(1)] }));
    const result = await complete(storage, { parts: [{ number: 5 }] });
    expect(result).toMatchObject({ ok: true, parts: [{ number: 5, status: 'not_started' }] });
  });

  it('answers not_found for an unknown slug and book_deleted for a deleted one', async () => {
    const { storage } = fakeStorage();
    expect(await complete(storage, { parts: [] })).toEqual({ ok: false, reason: 'not_found' });
    await t.db
      .insert(schema.books)
      .values({ slug: 'hesse-siddhartha', title: 'x', deletedAt: new Date() });
    expect(await complete(storage, { parts: [] })).toEqual({ ok: false, reason: 'book_deleted' });
  });

  describe('big files (multipart)', () => {
    async function startBig() {
      const fake = fakeStorage();
      const started = await begin(fake.storage, book({ parts: [part(1, { size: 101 * MB })] }));
      const key = (started.parts[0] as { key: string }).key;
      fake.sizes.set(key, 101 * MB);
      return { ...fake, key };
    }
    const etags = Array.from({ length: 7 }, (_, i) => `"etag-${i + 1}"`);

    it('joins the pieces in storage, then makes the part ready', async () => {
      const { storage, key } = await startBig();
      const result = await complete(storage, {
        parts: [{ number: 1, uploadId: 'upload-1', etags }],
      });
      expect(storage.completeMultipart).toHaveBeenCalledWith({
        key,
        uploadId: 'upload-1',
        parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })),
      });
      expect(result).toMatchObject({ ok: true, allReady: true, parts: [{ status: 'ready' }] });
    });

    it('asks for the upload id and ETags when they are missing, without failing the part', async () => {
      const { storage } = await startBig();
      const result = await complete(storage, { parts: [{ number: 1 }] });
      expect(result).toMatchObject({ parts: [{ number: 1, status: 'needs_upload_info' }] });
      expect((await rowsOf()).tracks[0]!.status).toBe('uploading');
    });

    it('aborts the upload and fails the part when the wrong number of ETags arrives', async () => {
      const { storage, key } = await startBig();
      const result = await complete(storage, {
        parts: [{ number: 1, uploadId: 'upload-1', etags: etags.slice(0, 3) }],
      });
      expect(storage.abortMultipart).toHaveBeenCalledWith({ key, uploadId: 'upload-1' });
      expect(storage.completeMultipart).not.toHaveBeenCalled();
      expect(result).toMatchObject({ parts: [{ status: 'failed' }] });
      expect((await rowsOf()).tracks[0]!.status).toBe('failed');
    });

    it('aborts the upload and fails the part when storage cannot join the pieces', async () => {
      const { storage } = await startBig();
      storage.completeMultipart.mockRejectedValueOnce(new Error('boom'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await complete(storage, {
        parts: [{ number: 1, uploadId: 'upload-1', etags }],
      });
      expect(storage.abortMultipart).toHaveBeenCalled();
      expect(result).toMatchObject({ parts: [{ status: 'failed' }] });
    });
  });

  describe('publishing', () => {
    it('stays a draft unless asked', async () => {
      const { storage } = fakeStorage();
      await begin(storage, book());
      const result = await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });
      expect(result).toMatchObject({ book: { status: 'draft' }, publish: { requested: false } });
      expect((await rowsOf()).book!.publishedAt).toBeNull();
    });

    it('publishes when asked and the rules pass', async () => {
      const { storage } = fakeStorage();
      await begin(storage, book());
      const result = await complete(storage, {
        parts: [{ number: 1 }, { number: 2 }],
        publish: true,
      });
      expect(result).toMatchObject({
        allReady: true,
        book: { status: 'published' },
        publish: { requested: true, published: true },
      });
      expect((await rowsOf()).book!.publishedAt).toBeInstanceOf(Date);
    });

    it('stays a draft and says what is missing when the rules fail', async () => {
      const { storage } = fakeStorage();
      await begin(storage, book({ author: null, category: null }));
      const result = await complete(storage, { parts: [{ number: 1 }], publish: true });
      expect(result).toMatchObject({
        ok: true,
        allReady: true, // the part is ready; only publishing was refused
        book: { status: 'draft' },
        publish: {
          requested: true,
          published: false,
          missing: ['author', 'category'],
          message: expect.stringContaining('Missing: author, category'),
        },
        parts: [{ number: 1, status: 'ready' }],
      });
      expect((await rowsOf()).book!.status).toBe('draft');
    });

    it('does not publish while a listed part is not ready', async () => {
      const { storage, sizes } = fakeStorage();
      const first = await begin(storage, book());
      sizes.set((first.parts[1] as { key: string }).key, 5);
      const result = await complete(storage, {
        parts: [{ number: 1 }, { number: 2 }],
        publish: true,
      });
      expect(result).toMatchObject({
        allReady: false,
        book: { status: 'draft' },
        publish: { requested: true, published: false },
      });
    });

    it('treats a book that is already published as published', async () => {
      const { storage } = fakeStorage();
      await begin(storage, book());
      await complete(storage, { parts: [{ number: 1 }, { number: 2 }], publish: true });
      const again = await complete(storage, { parts: [], publish: true });
      expect(again).toMatchObject({ allReady: true, publish: { published: true } });
    });
  });
});

describe('importing again (ongoing books)', () => {
  async function importFirstTwo(storage: ImportStorage) {
    await begin(storage, book({ ongoing: true }));
    await complete(storage, { parts: [{ number: 1 }, { number: 2 }], publish: true });
    return rowsOf();
  }

  it('appends only the new parts and never writes an existing part or chapter', async () => {
    const { storage } = fakeStorage();
    const before = await importFirstTwo(storage);

    const result = await begin(
      storage,
      book({ ongoing: true, parts: [part(1), part(2), part(3), part(4)] }),
    );
    expect(result.book).toMatchObject({ created: false, status: 'published' });
    expect(result.parts.map((p) => [p.number, p.action])).toEqual([
      [1, 'skip'],
      [2, 'skip'],
      [3, 'upload'],
      [4, 'upload'],
    ]);
    const done = await complete(storage, { parts: [{ number: 3 }, { number: 4 }] });
    expect(done).toMatchObject({ allReady: true, book: { status: 'published' } });

    const after = await rowsOf();
    expect(after.tracks.map((x) => [x.position, x.status])).toEqual([
      [1, 'ready'],
      [2, 'ready'],
      [3, 'ready'],
      [4, 'ready'],
    ]);
    // The rows that were there are byte for byte the same, `updated_at` included.
    expect(after.tracks.slice(0, 2)).toEqual(before.tracks);
    expect(after.chapters.slice(0, 2)).toEqual(before.chapters);
    expect(after.chapters.map((c) => [c.position, c.startSeconds, c.endSeconds])).toEqual([
      [1, 0, 100],
      [2, 100, 200],
      [3, 200, 300],
      [4, 300, 400],
    ]);
    expect(after.book!.durationSeconds).toBe(400);
    expect(after.book!.publishedAt).toEqual(before.book!.publishedAt);
  });

  it('does nothing when every part is already there', async () => {
    const { storage } = fakeStorage();
    const before = await importFirstTwo(storage);
    const result = await begin(storage, book({ ongoing: true }));
    expect(result.parts.map((p) => p.action)).toEqual(['skip', 'skip']);
    expect(result.changed).toBe(false);
    expect(await rowsOf()).toEqual(before);
  });

  it('does not overwrite what the admin edited: only `ongoing` may change', async () => {
    const { storage } = fakeStorage();
    await importFirstTwo(storage);
    await t.db
      .update(schema.books)
      .set({ title: 'Edited by hand', description: 'Hand-written.' })
      .where(eq(schema.books.slug, 'hesse-siddhartha'));

    const result = await begin(
      storage,
      book({ title: 'Different', description: 'Different', ongoing: false, category: null }),
    );
    expect(result.changed).toBe(true);
    const { book: row } = await rowsOf();
    expect(row).toMatchObject({
      title: 'Edited by hand',
      description: 'Hand-written.',
      ongoing: false, // the pipeline marked the book complete
      status: 'published',
    });
    expect(row!.categoryId).not.toBeNull();
  });

  it('leaves a part the admin removed removed', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book({ parts: [part(1), part(2), part(3)] }));
    await complete(storage, { parts: [{ number: 1 }, { number: 2 }, { number: 3 }] });
    await t.db.delete(schema.tracks).where(eq(schema.tracks.title, 'Part 2'));

    const result = await begin(storage, book({ parts: [part(1), part(2), part(3), part(4)] }));
    expect(result.parts.map((p) => [p.number, p.action])).toEqual([
      [1, 'skip'],
      [2, 'removed'],
      [3, 'skip'],
      [4, 'upload'],
    ]);
  });

  it('reports a ready part whose file changed and leaves it alone', async () => {
    const { storage } = fakeStorage();
    const before = await importFirstTwo(storage);
    const other = 'ffffffff'.repeat(8);
    const result = await begin(
      storage,
      book({ ongoing: true, parts: [part(1, { sha256: other }), part(2)] }),
    );
    expect(result.parts[0]).toMatchObject({ number: 1, action: 'changed' });
    expect(result.warnings).toEqual([expect.stringContaining('Part 1')]);
    expect(await rowsOf()).toEqual(before);
  });

  it('resumes an interrupted import: the same key comes back and the upload can finish', async () => {
    const { storage } = fakeStorage();
    const first = await begin(storage, book());
    // The script died after the first request: both parts are still `uploading`.
    const again = await begin(storage, book());
    expect(again.parts.map((p) => p.action)).toEqual(['upload', 'upload']);
    expect((again.parts[0] as { key: string }).key).toBe((first.parts[0] as { key: string }).key);
    expect((again.parts[0] as { trackId: string }).trackId).toBe(
      (first.parts[0] as { trackId: string }).trackId,
    );

    const done = await complete(storage, { parts: [{ number: 1 }, { number: 2 }] });
    expect(done).toMatchObject({ allReady: true });
    expect((await rowsOf()).tracks).toHaveLength(2);
  });

  it('resumes a part that failed, even with a different file', async () => {
    const { storage, sizes } = fakeStorage();
    const first = await begin(storage, book());
    sizes.set((first.parts[0] as { key: string }).key, 1);
    await complete(storage, { parts: [{ number: 1 }, { number: 2 }] }); // part 1 fails

    const other = 'ffffffff'.repeat(8);
    const again = await begin(storage, book({ parts: [part(1, { sha256: other }), part(2)] }));
    expect(again.parts[0]).toMatchObject({
      number: 1,
      action: 'upload',
      key: 'books/hesse-siddhartha/audio/01-part-1-ffffffff.mp3',
    });
  });

  it('will not put a part before one that is ready on a published book', async () => {
    const { storage } = fakeStorage();
    await begin(storage, book({ parts: [part(1), part(2), part(3)] }));
    await complete(storage, {
      parts: [{ number: 1 }, { number: 2 }, { number: 3 }],
      publish: true,
    });
    await t.db
      .update(schema.tracks)
      .set({ status: 'failed' })
      .where(eq(schema.tracks.title, 'Part 2'));

    const result = await begin(storage, book({ parts: [part(1), part(2), part(3), part(4)] }));
    expect(result.parts.map((p) => [p.number, p.action])).toEqual([
      [1, 'skip'],
      [2, 'blocked'],
      [3, 'skip'],
    ]);
    expect(result.deferred).toEqual([4]);
    expect(result.warnings).toEqual([expect.stringContaining('Part 2')]);
  });

  it('refuses a deleted book', async () => {
    const { storage } = fakeStorage();
    await importFirstTwo(storage);
    await t.db.update(schema.books).set({ deletedAt: new Date() });
    const ctx = await loadImportContext(t.db, 'hesse-siddhartha');
    expect(await beginImport(t.db, storage, ctx, book())).toEqual({
      ok: false,
      reason: 'book_deleted',
    });
  });
});
