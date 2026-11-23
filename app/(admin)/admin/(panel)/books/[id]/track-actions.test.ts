// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getDb: vi.fn(),
  revalidateCatalogue: vi.fn(),
  createUploadUrl: vi.fn(),
  createMultipartUpload: vi.fn(),
  createPartUploadUrls: vi.fn(),
  completeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
  headObject: vi.fn(),
}));

vi.mock('@/lib/auth/admin/guard', () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/features/admin/revalidate', () => ({ revalidateCatalogue: mocks.revalidateCatalogue }));
vi.mock('@/lib/r2/client', () => ({
  createUploadUrl: mocks.createUploadUrl,
  createMultipartUpload: mocks.createMultipartUpload,
  createPartUploadUrls: mocks.createPartUploadUrls,
  completeMultipartUpload: mocks.completeMultipartUpload,
  abortMultipartUpload: mocks.abortMultipartUpload,
  headObject: mocks.headObject,
}));

import {
  abortMultipartUploadAction,
  completeMultipartUploadAction,
  completeTrackUploadAction,
  failTrackUploadAction,
  getPartUrlsAction,
  removeTrackAction,
  renameChapterAction,
  renameTrackAction,
  reorderTracksAction,
  restartTrackUploadAction,
  startTrackUploadAction,
} from './track-actions';

const MB = 1024 * 1024;
const HASH = 'ab12cd34'.repeat(8);
const NO_BOOK = '00000000-0000-4000-8000-000000000000';
const file = (name: string, size: number) => ({ name, type: 'audio/mpeg', size });
const input = (name: string, size: number) => ({
  file: file(name, size),
  hash: HASH,
  durationSeconds: 60,
});

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
let bookId: string;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

beforeEach(async () => {
  vi.resetAllMocks();
  await t.db.delete(schema.books);
  const [book] = await t.db
    .insert(schema.books)
    .values({ slug: 'my-book', title: 'My book', status: 'draft' })
    .returning();
  bookId = book!.id;
  mocks.getAdminSession.mockResolvedValue({ adminId: 'owner' });
  mocks.getDb.mockReturnValue(t.db);
  mocks.createUploadUrl.mockResolvedValue({ url: 'https://r2.test/put', headers: {} });
  mocks.createMultipartUpload.mockResolvedValue({ uploadId: 'up-1' });
  mocks.createPartUploadUrls.mockImplementation(async ({ partCount }: { partCount: number }) =>
    Array.from({ length: partCount }, (_, i) => `https://r2.test/part-${i + 1}`),
  );
  mocks.completeMultipartUpload.mockResolvedValue(undefined);
  mocks.abortMultipartUpload.mockResolvedValue(undefined);
});

const track = async (id: string) =>
  (await t.db.select().from(schema.tracks).where(eq(schema.tracks.id, id)))[0]!;

/** A part of 150 MB that is uploading, with its multipart upload open. */
async function bigUploading(size = 150 * MB) {
  const started = await startTrackUploadAction(bookId, input('big.mp3', size));
  if (!started.ok || !started.trackId) throw new Error('could not start');
  mocks.revalidateCatalogue.mockClear();
  return started.trackId;
}
const partsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ partNumber: i + 1, etag: `"e${i + 1}"` }));

describe('every action checks the admin session first', () => {
  it('does nothing at all for a visitor without one', async () => {
    mocks.getAdminSession.mockResolvedValue(null);
    const results = await Promise.all([
      startTrackUploadAction(bookId, input('a.mp3', 10)),
      restartTrackUploadAction(bookId, NO_BOOK, input('a.mp3', 10)),
      failTrackUploadAction(bookId, NO_BOOK, 'x'),
      completeTrackUploadAction(bookId, NO_BOOK),
      getPartUrlsAction(bookId, NO_BOOK, 'up-1'),
      completeMultipartUploadAction(bookId, NO_BOOK, 'up-1', partsFor(1)),
      abortMultipartUploadAction(bookId, NO_BOOK, 'up-1', 'x'),
      renameTrackAction(bookId, NO_BOOK, 'x'),
      renameChapterAction(bookId, NO_BOOK, 'x'),
      removeTrackAction(bookId, NO_BOOK),
      reorderTracksAction(bookId, []),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        message: expect.stringMatching(/session has ended/i),
      });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
    for (const name of [
      'createUploadUrl',
      'createMultipartUpload',
      'createPartUploadUrls',
      'completeMultipartUpload',
      'abortMultipartUpload',
      'headObject',
    ] as const) {
      expect(mocks[name]).not.toHaveBeenCalled();
    }
    expect((await t.db.select().from(schema.tracks)).length).toBe(0);
  });
});

describe('starting an upload', () => {
  it('up to 100 MB gives one address to PUT to, and revalidates', async () => {
    const result = await startTrackUploadAction(bookId, input('small.mp3', 100 * MB));
    expect(result).toMatchObject({ ok: true, upload: { url: 'https://r2.test/put' } });
    expect(mocks.createMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('over 100 MB opens a multipart upload and answers with its id, the part size and the part count', async () => {
    const result = await startTrackUploadAction(bookId, input('big.mp3', 150 * MB));
    expect(result).toMatchObject({
      ok: true,
      multipart: { uploadId: 'up-1', partSize: 16 * MB, partCount: 10 },
    });
    expect(result.ok && result.upload).toBeUndefined();
    expect(mocks.createUploadUrl).not.toHaveBeenCalled();
    expect(mocks.createMultipartUpload).toHaveBeenCalledWith({
      key: expect.stringMatching(/^books\/my-book\/audio\/01-big-.+\.mp3$/),
      contentType: 'audio/mpeg',
    });
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('refuses a file over 500 MB without creating a part or an upload', async () => {
    const result = await startTrackUploadAction(bookId, input('huge.mp3', 500 * MB + 1));
    expect(result).toMatchObject({ ok: false });
    expect(mocks.createMultipartUpload).not.toHaveBeenCalled();
    expect((await t.db.select().from(schema.tracks)).length).toBe(0);
  });

  it('marks the part failed when storage cannot open the upload', async () => {
    mocks.createMultipartUpload.mockRejectedValue(new Error('down'));
    const result = await startTrackUploadAction(bookId, input('big.mp3', 150 * MB));
    expect(result).toMatchObject({
      ok: false,
      message: 'Could not prepare the upload. Try again.',
    });
    const [row] = await t.db.select().from(schema.tracks);
    expect(row).toMatchObject({ status: 'failed' });
  });
});

describe('getPartUrlsAction', () => {
  it('gives one address per part for the file the part was declared with', async () => {
    const trackId = await bigUploading(150 * MB);
    const result = await getPartUrlsAction(bookId, trackId, 'up-1');
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.urls).toHaveLength(10);
    expect(mocks.createPartUploadUrls).toHaveBeenCalledWith({
      key: expect.stringContaining('books/my-book/audio/'),
      uploadId: 'up-1',
      partCount: 10,
    });
  });

  it('refuses a part that is not uploading, one of another book, a small file, and a missing upload id', async () => {
    const trackId = await bigUploading();
    const small = await startTrackUploadAction(bookId, input('small.mp3', 10 * MB));
    const smallId = small.ok ? small.trackId! : '';
    expect(await getPartUrlsAction(bookId, smallId, 'up-1')).toMatchObject({ ok: false });
    expect(await getPartUrlsAction(NO_BOOK, trackId, 'up-1')).toMatchObject({ ok: false });
    expect(await getPartUrlsAction(bookId, trackId, '')).toMatchObject({ ok: false });
    await t.db.update(schema.tracks).set({ status: 'failed' }).where(eq(schema.tracks.id, trackId));
    expect(await getPartUrlsAction(bookId, trackId, 'up-1')).toMatchObject({ ok: false });
    expect(mocks.createPartUploadUrls).not.toHaveBeenCalled();
  });
});

describe('completeMultipartUploadAction', () => {
  it('joins the parts in order, checks the stored file, makes the part ready, and revalidates', async () => {
    const trackId = await bigUploading(150 * MB);
    mocks.headObject.mockResolvedValue({ size: 150 * MB });
    const shuffled = partsFor(10).reverse();

    const result = await completeMultipartUploadAction(bookId, trackId, 'up-1', shuffled);

    expect(result).toMatchObject({ ok: true });
    expect(mocks.completeMultipartUpload).toHaveBeenCalledWith({
      key: expect.stringContaining('books/my-book/audio/'),
      uploadId: 'up-1',
      parts: partsFor(10),
    });
    expect(mocks.abortMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
    expect((await track(trackId)).status).toBe('ready');
    expect(result.ok && result.snapshot.chapters).toHaveLength(1);
  });

  it('aborts and fails the part when the browser reports the wrong parts, without joining anything', async () => {
    const trackId = await bigUploading(150 * MB);
    const result = await completeMultipartUploadAction(bookId, trackId, 'up-1', partsFor(9));
    expect(result).toMatchObject({ ok: false });
    expect(mocks.completeMultipartUpload).not.toHaveBeenCalled();
    expect(mocks.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect((await track(trackId)).status).toBe('failed');
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('aborts and fails the part when storage cannot join them', async () => {
    const trackId = await bigUploading(150 * MB);
    mocks.completeMultipartUpload.mockRejectedValue(new Error('EntityTooSmall'));
    const result = await completeMultipartUploadAction(bookId, trackId, 'up-1', partsFor(10));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/could not join/i) });
    expect(mocks.abortMultipartUpload).toHaveBeenCalledTimes(1);
    expect(await track(trackId)).toMatchObject({ status: 'failed' });
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('fails the part when the joined file is not the size that was declared', async () => {
    const trackId = await bigUploading(150 * MB);
    mocks.headObject.mockResolvedValue({ size: 150 * MB - 1 });
    const result = await completeMultipartUploadAction(bookId, trackId, 'up-1', partsFor(10));
    expect(result).toMatchObject({ ok: false });
    expect((await track(trackId)).status).toBe('failed');
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('refuses a part that is no longer uploading, and joins nothing', async () => {
    const trackId = await bigUploading(150 * MB);
    await t.db.update(schema.tracks).set({ status: 'failed' }).where(eq(schema.tracks.id, trackId));
    const result = await completeMultipartUploadAction(bookId, trackId, 'up-1', partsFor(10));
    expect(result).toMatchObject({ ok: false });
    expect(mocks.completeMultipartUpload).not.toHaveBeenCalled();
  });
});

describe('abortMultipartUploadAction', () => {
  it('aborts the upload in storage, marks the part failed with the reason, and revalidates', async () => {
    const trackId = await bigUploading();
    const result = await abortMultipartUploadAction(bookId, trackId, 'up-1', 'Upload cancelled.');
    expect(result).toMatchObject({ ok: true });
    expect(mocks.abortMultipartUpload).toHaveBeenCalledWith({
      key: expect.stringContaining('books/my-book/audio/'),
      uploadId: 'up-1',
    });
    expect(await track(trackId)).toMatchObject({
      status: 'failed',
      failureReason: 'Upload cancelled.',
    });
    expect(mocks.revalidateCatalogue).toHaveBeenCalled();
  });

  it('still marks the part failed when storage cannot be reached to abort', async () => {
    const trackId = await bigUploading();
    mocks.abortMultipartUpload.mockRejectedValue(new Error('offline'));
    const result = await abortMultipartUploadAction(bookId, trackId, 'up-1', 'The upload failed.');
    expect(result).toMatchObject({ ok: true });
    expect(await track(trackId)).toMatchObject({ status: 'failed' });
  });

  it('leaves a part that is already finished alone', async () => {
    const trackId = await bigUploading();
    await t.db.update(schema.tracks).set({ status: 'ready' }).where(eq(schema.tracks.id, trackId));
    await abortMultipartUploadAction(bookId, trackId, 'up-1', 'late');
    expect(mocks.abortMultipartUpload).not.toHaveBeenCalled();
    expect((await track(trackId)).status).toBe('ready');
  });
});

describe('saves revalidate the catalogue', () => {
  it('completing a single-request upload does', async () => {
    const started = await startTrackUploadAction(bookId, input('one.mp3', 10 * MB));
    const trackId = started.ok ? started.trackId! : '';
    mocks.revalidateCatalogue.mockClear();
    mocks.headObject.mockResolvedValue({ size: 10 * MB });
    expect(await completeTrackUploadAction(bookId, trackId)).toMatchObject({ ok: true });
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
  });

  it('adding a part to a published book does, and leaves the existing chapters alone', async () => {
    await t.db.update(schema.books).set({ status: 'published' }).where(eq(schema.books.id, bookId));
    mocks.headObject.mockResolvedValue({ size: 10 * MB });
    const first = await startTrackUploadAction(bookId, input('one.mp3', 10 * MB));
    await completeTrackUploadAction(bookId, first.ok ? first.trackId! : '');
    const before = await t.db.select().from(schema.chapters);

    const second = await startTrackUploadAction(bookId, input('two.mp3', 10 * MB));
    mocks.revalidateCatalogue.mockClear();
    const done = await completeTrackUploadAction(bookId, second.ok ? second.trackId! : '');

    expect(done).toMatchObject({ ok: true });
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
    const after = await t.db.select().from(schema.chapters);
    expect(after).toHaveLength(2);
    expect(after.find((c) => c.id === before[0]!.id)).toEqual(before[0]);
  });

  it('reordering a draft does; a refused reorder of a published book does not', async () => {
    mocks.headObject.mockResolvedValue({ size: 10 * MB });
    const ids: string[] = [];
    for (const name of ['a.mp3', 'b.mp3']) {
      const started = await startTrackUploadAction(bookId, input(name, 10 * MB));
      const id = started.ok ? started.trackId! : '';
      await completeTrackUploadAction(bookId, id);
      ids.push(id);
    }
    mocks.revalidateCatalogue.mockClear();
    expect(await reorderTracksAction(bookId, [ids[1]!, ids[0]!])).toMatchObject({ ok: true });
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);

    mocks.revalidateCatalogue.mockClear();
    await t.db.update(schema.books).set({ status: 'published' }).where(eq(schema.books.id, bookId));
    expect(await reorderTracksAction(bookId, [ids[0]!, ids[1]!])).toMatchObject({
      ok: false,
      message: expect.stringMatching(/published book cannot be changed/i),
    });
    expect(mocks.revalidateCatalogue).not.toHaveBeenCalled();
  });

  it('renaming and removing do', async () => {
    const started = await startTrackUploadAction(bookId, input('a.mp3', 10 * MB));
    const id = started.ok ? started.trackId! : '';
    mocks.revalidateCatalogue.mockClear();
    await renameTrackAction(bookId, id, 'New name');
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(1);
    await removeTrackAction(bookId, id);
    expect(mocks.revalidateCatalogue).toHaveBeenCalledTimes(2);
  });
});
