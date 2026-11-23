// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import {
  beginTrackUpload,
  completeTrackUpload,
  failTrackUpload,
  getBookTracks,
  getUploadingTrack,
  removeTrack,
  renameChapter,
  renameTrack,
  reorderTracks,
  restartTrackUpload,
} from './data';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
let bookId: string;
let publishedId: string;
const HASH = 'ab12cd34'.repeat(8);
const file = (name: string, size = 1000) => ({ name, type: 'audio/mpeg', size });
const head = (size: number) => vi.fn(async () => ({ size }));

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.books);
  const [draft, published] = await t.db
    .insert(schema.books)
    .values([
      { slug: 'my-book', title: 'My book', status: 'draft' },
      { slug: 'live-book', title: 'Live', status: 'published' },
    ])
    .returning();
  bookId = draft!.id;
  publishedId = published!.id;
});

async function addReady(id: string, name: string, seconds: number, size = 1000) {
  const begun = await beginTrackUpload(t.db, {
    bookId: id,
    file: file(name, size),
    hash: HASH,
    durationSeconds: seconds,
  });
  if (!begun.ok) throw new Error(begun.reason);
  const done = await completeTrackUpload(t.db, begun.trackId, head(size));
  if (!done.ok) throw new Error(done.reason);
  return begun.trackId;
}

describe('beginTrackUpload', () => {
  it('adds an uploading track at the next position with a key from the book, number and hash', async () => {
    const first = await beginTrackUpload(t.db, {
      bookId,
      file: file('Part one.mp3'),
      hash: HASH,
      durationSeconds: 600,
    });
    expect(first).toMatchObject({ ok: true, key: 'books/my-book/audio/01-part-one-ab12cd34.mp3' });
    const second = await beginTrackUpload(t.db, {
      bookId,
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 60,
    });
    expect(second).toMatchObject({ ok: true, key: 'books/my-book/audio/02-two-ab12cd34.mp3' });

    const { tracks, chapters } = await getBookTracks(t.db, bookId);
    expect(tracks.map((x) => [x.position, x.title, x.status])).toEqual([
      [1, 'Part one', 'uploading'],
      [2, 'two', 'uploading'],
    ]);
    expect(tracks[0]).toMatchObject({ originalFilename: 'Part one.mp3', sizeBytes: 1000 });
    expect(chapters).toEqual([]); // a chapter appears when the track is ready
  });

  it('refuses a file that is not MP3 or M4A, and a length that could not be read', async () => {
    expect(
      await beginTrackUpload(t.db, {
        bookId,
        file: file('a.wav'),
        hash: HASH,
        durationSeconds: 5,
      }),
    ).toMatchObject({ ok: false, reason: 'bad_file' });
    for (const durationSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        await beginTrackUpload(t.db, { bookId, file: file('a.mp3'), hash: HASH, durationSeconds }),
      ).toMatchObject({ ok: false, reason: 'bad_duration' });
    }
    expect((await getBookTracks(t.db, bookId)).tracks).toEqual([]);
  });

  it('refuses a bad hash and a book that does not exist or is deleted', async () => {
    expect(
      await beginTrackUpload(t.db, {
        bookId,
        file: file('a.mp3'),
        hash: 'xyz',
        durationSeconds: 5,
      }),
    ).toMatchObject({ ok: false, reason: 'bad_file' });
    expect(
      await beginTrackUpload(t.db, {
        bookId: '00000000-0000-4000-8000-000000000000',
        file: file('a.mp3'),
        hash: HASH,
        durationSeconds: 5,
      }),
    ).toMatchObject({ ok: false, reason: 'book_missing' });
    await t.db
      .update(schema.books)
      .set({ deletedAt: new Date() })
      .where(eq(schema.books.id, bookId));
    expect(
      await beginTrackUpload(t.db, { bookId, file: file('a.mp3'), hash: HASH, durationSeconds: 5 }),
    ).toMatchObject({ ok: false, reason: 'book_missing' });
  });

  it('gives two uploads started at the same moment different positions', async () => {
    const [a, b] = await Promise.all([
      beginTrackUpload(t.db, { bookId, file: file('a.mp3'), hash: HASH, durationSeconds: 5 }),
      beginTrackUpload(t.db, { bookId, file: file('b.mp3'), hash: HASH, durationSeconds: 5 }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const { tracks } = await getBookTracks(t.db, bookId);
    expect(tracks.map((x) => x.position).sort()).toEqual([1, 2]);
  });
});

describe('beginTrackUpload: options for the import', () => {
  const base = { file: file('01.mp3'), hash: HASH, durationSeconds: 60 };

  it('uses the given title for the part and the key, not the file name', async () => {
    const result = await beginTrackUpload(t.db, { ...base, bookId }, { title: '  Син брагмана ' });
    expect(result).toMatchObject({
      ok: true,
      key: 'books/my-book/audio/01-syn-brahmana-ab12cd34.mp3',
    });
    expect((await getBookTracks(t.db, bookId)).tracks[0]).toMatchObject({
      title: 'Син брагмана',
      originalFilename: '01.mp3',
    });
  });

  it('accepts the expected position, and refuses it when another part took the place', async () => {
    expect(await beginTrackUpload(t.db, { ...base, bookId }, { expectPosition: 1 })).toMatchObject({
      ok: true,
    });
    const stale = await beginTrackUpload(t.db, { ...base, bookId }, { expectPosition: 1 });
    expect(stale).toMatchObject({ ok: false, reason: 'wrong_state' });
    expect((await getBookTracks(t.db, bookId)).tracks).toHaveLength(1);
  });
});

describe('completeTrackUpload', () => {
  it('checks the stored object, makes the track ready, adds its chapter and updates the book length', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('Part one.mp3', 5000),
      hash: HASH,
      durationSeconds: 600.5,
    });
    if (!begun.ok) throw new Error();
    const headFn = head(5000);
    expect(await completeTrackUpload(t.db, begun.trackId, headFn)).toEqual({ ok: true });
    expect(headFn).toHaveBeenCalledWith('books/my-book/audio/01-part-one-ab12cd34.mp3');

    const { tracks, chapters } = await getBookTracks(t.db, bookId);
    expect(tracks[0]).toMatchObject({ status: 'ready', failureReason: null });
    expect(chapters).toMatchObject([
      { position: 1, title: 'Part one', startSeconds: 0, endSeconds: 600.5 },
    ]);
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, bookId));
    expect(book!.durationSeconds).toBe(600.5);
  });

  it('puts each next chapter where the book ended and adds up the book length', async () => {
    await addReady(bookId, 'one.mp3', 100);
    await addReady(bookId, 'two.mp3', 50.5);
    const { chapters } = await getBookTracks(t.db, bookId);
    expect(chapters.map((c) => [c.title, c.startSeconds, c.endSeconds])).toEqual([
      ['one', 0, 100],
      ['two', 100, 150.5],
    ]);
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, bookId));
    expect(book!.durationSeconds).toBe(150.5);
  });

  it('fails the track, with a reason, when the file never arrived', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('a.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    expect(
      await completeTrackUpload(
        t.db,
        begun.trackId,
        vi.fn(async () => null),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'failed',
    });
    const { tracks, chapters } = await getBookTracks(t.db, bookId);
    expect(tracks[0]).toMatchObject({ status: 'failed' });
    expect(tracks[0]!.failureReason).toMatch(/did not arrive/i);
    expect(chapters).toEqual([]);
  });

  it('fails the track when the stored size differs from the file size', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('a.mp3', 1000),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    expect(await completeTrackUpload(t.db, begun.trackId, head(999))).toMatchObject({ ok: false });
    expect((await getBookTracks(t.db, bookId)).tracks[0]!.failureReason).toMatch(/999/);
  });

  it('fails the track, and does not throw, when storage cannot be reached', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('a.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    const broken = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await completeTrackUpload(t.db, begun.trackId, broken)).toMatchObject({ ok: false });
    expect((await getBookTracks(t.db, bookId)).tracks[0]).toMatchObject({ status: 'failed' });
  });

  it('only completes a track that is uploading', async () => {
    const id = await addReady(bookId, 'a.mp3', 10);
    expect(await completeTrackUpload(t.db, id, head(1000))).toMatchObject({
      ok: false,
      reason: 'wrong_state',
    });
    expect((await getBookTracks(t.db, bookId)).chapters).toHaveLength(1); // no second chapter
  });

  it('puts a track that finishes before an earlier one in the right place in book time', async () => {
    const one = await beginTrackUpload(t.db, {
      bookId,
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 100,
    });
    const two = await beginTrackUpload(t.db, {
      bookId,
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 50,
    });
    if (!one.ok || !two.ok) throw new Error();
    await completeTrackUpload(t.db, two.trackId, head(1000));
    await completeTrackUpload(t.db, one.trackId, head(1000));
    const { chapters } = await getBookTracks(t.db, bookId);
    expect(chapters.map((c) => [c.title, c.startSeconds, c.endSeconds])).toEqual([
      ['one', 0, 100],
      ['two', 100, 150],
    ]);
  });

  it('appends to a published book without moving the chapters already there', async () => {
    await addReady(publishedId, 'one.mp3', 100);
    const before = (await getBookTracks(t.db, publishedId)).chapters;
    await addReady(publishedId, 'two.mp3', 40);
    const after = (await getBookTracks(t.db, publishedId)).chapters;
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toMatchObject({ startSeconds: 100, endSeconds: 140, position: 2 });
  });
});

describe('failTrackUpload and restartTrackUpload', () => {
  it('marks an uploading track failed with the reason, and a retry reuses its place and title', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    await renameTrack(t.db, begun.trackId, 'Chapter One');
    expect(await failTrackUpload(t.db, begun.trackId, 'Upload interrupted')).toEqual({ ok: true });
    expect((await getBookTracks(t.db, bookId)).tracks[0]).toMatchObject({
      status: 'failed',
      failureReason: 'Upload interrupted',
    });

    const retried = await restartTrackUpload(t.db, begun.trackId, {
      file: file('one-better.mp3', 2000),
      hash: 'f'.repeat(64),
      durationSeconds: 7,
    });
    expect(retried).toMatchObject({
      ok: true,
      key: 'books/my-book/audio/01-chapter-one-ffffffff.mp3',
    });
    expect((await getBookTracks(t.db, bookId)).tracks[0]).toMatchObject({
      position: 1,
      title: 'Chapter One',
      status: 'uploading',
      failureReason: null,
      sizeBytes: 2000,
      originalFilename: 'one-better.mp3',
      durationSeconds: 7,
    });
  });

  it('only fails a track that is in progress and only restarts one that failed', async () => {
    const id = await addReady(bookId, 'a.mp3', 10);
    expect(await failTrackUpload(t.db, id, 'x')).toMatchObject({
      ok: false,
      reason: 'wrong_state',
    });
    expect(
      await restartTrackUpload(t.db, id, { file: file('b.mp3'), hash: HASH, durationSeconds: 5 }),
    ).toMatchObject({ ok: false, reason: 'wrong_state' });
  });
});

describe('renaming', () => {
  it('renames a track without touching its chapter, and a chapter without touching its track', async () => {
    const id = await addReady(bookId, 'one.mp3', 10);
    expect(await renameTrack(t.db, id, '  New track name ')).toEqual({ ok: true });
    let state = await getBookTracks(t.db, bookId);
    expect(state.tracks[0]!.title).toBe('New track name');
    expect(state.chapters[0]!.title).toBe('one');

    expect(await renameChapter(t.db, state.chapters[0]!.id, 'Prologue')).toEqual({ ok: true });
    state = await getBookTracks(t.db, bookId);
    expect(state.chapters[0]!.title).toBe('Prologue');
    expect(state.tracks[0]!.title).toBe('New track name');
  });

  it('refuses an empty or very long name and an unknown id', async () => {
    const id = await addReady(bookId, 'one.mp3', 10);
    expect(await renameTrack(t.db, id, '   ')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await renameTrack(t.db, id, 'x'.repeat(201))).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    expect(await renameTrack(t.db, '00000000-0000-4000-8000-000000000000', 'ok')).toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(await renameChapter(t.db, '00000000-0000-4000-8000-000000000000', 'ok')).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });
});

describe('removeTrack', () => {
  it('removes an uploading or failed track and leaves the rest alone', async () => {
    await addReady(bookId, 'one.mp3', 100);
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    expect(await removeTrack(t.db, begun.trackId)).toEqual({ ok: true });
    const { tracks, chapters } = await getBookTracks(t.db, bookId);
    expect(tracks).toHaveLength(1);
    expect(chapters).toHaveLength(1);
  });

  it('removes a ready track from a draft: its chapter goes, later chapters move forward, the length shrinks', async () => {
    await addReady(bookId, 'one.mp3', 100);
    const two = await addReady(bookId, 'two.mp3', 50);
    await addReady(bookId, 'three.mp3', 25);
    expect(await removeTrack(t.db, two)).toEqual({ ok: true });
    const { tracks, chapters } = await getBookTracks(t.db, bookId);
    expect(tracks.map((x) => x.title)).toEqual(['one', 'three']);
    expect(chapters.map((c) => [c.title, c.position, c.startSeconds, c.endSeconds])).toEqual([
      ['one', 1, 0, 100],
      ['three', 2, 100, 125],
    ]);
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, bookId));
    expect(book!.durationSeconds).toBe(125);
  });

  it('refuses to remove a ready track from a published book', async () => {
    const id = await addReady(publishedId, 'one.mp3', 100);
    expect(await removeTrack(t.db, id)).toMatchObject({ ok: false, reason: 'published' });
    expect((await getBookTracks(t.db, publishedId)).tracks).toHaveLength(1);
  });

  it('can remove a failed track from a published book', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId: publishedId,
      file: file('a.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    await failTrackUpload(t.db, begun.trackId, 'x');
    expect(await removeTrack(t.db, begun.trackId)).toEqual({ ok: true });
  });

  it('reports an unknown track', async () => {
    expect(await removeTrack(t.db, '00000000-0000-4000-8000-000000000000')).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });
});

const rows = async (id: string) => {
  const { tracks, chapters } = await getBookTracks(t.db, id);
  return { tracks, chapters };
};

describe('reorderTracks', () => {
  async function threeParts() {
    const a = await addReady(bookId, 'a.mp3', 100);
    const b = await addReady(bookId, 'b.mp3', 50);
    const c = await addReady(bookId, 'c.mp3', 25);
    return { a, b, c };
  }

  it('renumbers the parts and rebuilds the chapters from the new order', async () => {
    const { a, b, c } = await threeParts();
    expect(await reorderTracks(t.db, bookId, [c, a, b])).toEqual({ ok: true });
    const { tracks, chapters } = await rows(bookId);
    expect(tracks.map((x) => [x.id, x.position])).toEqual([
      [c, 1],
      [a, 2],
      [b, 3],
    ]);
    expect(chapters.map((x) => [x.position, x.title, x.startSeconds, x.endSeconds])).toEqual([
      [1, 'c', 0, 25],
      [2, 'a', 25, 125],
      [3, 'b', 125, 175],
    ]);
  });

  it('keeps the book length and keeps a custom chapter title with its part', async () => {
    const { a, b, c } = await threeParts();
    const { chapters } = await rows(bookId);
    await renameChapter(t.db, chapters[1]!.id, 'The storm'); // the chapter of part b
    await reorderTracks(t.db, bookId, [b, c, a]);
    const after = await rows(bookId);
    expect(after.chapters.map((x) => x.title)).toEqual(['The storm', 'c', 'a']);
    expect(after.chapters.at(-1)!.endSeconds).toBe(175);
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, bookId));
    expect(book!.durationSeconds).toBe(175);
    expect(after.tracks.map((x) => x.id)).toEqual([b, c, a]);
  });

  it('leaves a part that is not ready in its new place, with no chapter until it is ready', async () => {
    const { a, b } = await threeParts();
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('d.mp3'),
      hash: HASH,
      durationSeconds: 10,
    });
    if (!begun.ok) throw new Error();
    const order = [begun.trackId, b, a, (await rows(bookId)).tracks[2]!.id];
    expect(await reorderTracks(t.db, bookId, order)).toEqual({ ok: true });
    const after = await rows(bookId);
    expect(after.tracks.map((x) => x.id)).toEqual(order);
    expect(after.chapters).toHaveLength(3);
    // The unfinished part is first, so when it finishes its chapter goes to the start.
    const done = await completeTrackUpload(t.db, begun.trackId, head(1000));
    expect(done).toEqual({ ok: true });
    const finished = await rows(bookId);
    expect(finished.chapters.map((x) => [x.title, x.startSeconds, x.endSeconds])).toEqual([
      ['d', 0, 10],
      ['b', 10, 60],
      ['a', 60, 160],
      ['c', 160, 185],
    ]);
  });

  it('changes nothing when the order is the one the book already has', async () => {
    const { a, b, c } = await threeParts();
    const before = await rows(bookId);
    expect(await reorderTracks(t.db, bookId, [a, b, c])).toEqual({ ok: true });
    expect(await rows(bookId)).toEqual(before); // same chapter ids too: nothing was rebuilt
  });

  it('refuses a published or scheduled book and changes nothing', async () => {
    const a = await addReady(publishedId, 'a.mp3', 100);
    const b = await addReady(publishedId, 'b.mp3', 50);
    const before = await rows(publishedId);
    expect(await reorderTracks(t.db, publishedId, [b, a])).toEqual({
      ok: false,
      reason: 'published',
    });
    await t.db
      .update(schema.books)
      .set({ status: 'scheduled' })
      .where(eq(schema.books.id, publishedId));
    expect(await reorderTracks(t.db, publishedId, [b, a])).toEqual({
      ok: false,
      reason: 'published',
    });
    expect(await rows(publishedId)).toEqual(before);
  });

  it("refuses a list that is not exactly this book's parts, and a part of another book", async () => {
    const { a, b, c } = await threeParts();
    const other = await addReady(publishedId, 'x.mp3', 5);
    const before = await rows(bookId);
    for (const order of [[a, b], [a, b, c, other], [a, a, b], [a, b, other], []]) {
      expect(await reorderTracks(t.db, bookId, order)).toEqual({ ok: false, reason: 'mismatch' });
    }
    expect(await rows(bookId)).toEqual(before);
  });

  it('reports an unknown, deleted or malformed book', async () => {
    expect(await reorderTracks(t.db, '00000000-0000-4000-8000-000000000000', [])).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(await reorderTracks(t.db, 'nope', [])).toEqual({ ok: false, reason: 'missing' });
    await t.db
      .update(schema.books)
      .set({ deletedAt: new Date() })
      .where(eq(schema.books.id, bookId));
    expect(await reorderTracks(t.db, bookId, [])).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('adding parts to a published book', () => {
  it('appends the new part and leaves the existing parts and chapters exactly as they were', async () => {
    await addReady(publishedId, 'one.mp3', 100);
    await addReady(publishedId, 'two.mp3', 50);
    const { chapters } = await rows(publishedId);
    await t.db
      .update(schema.chapters)
      .set({ title: 'Custom' })
      .where(eq(schema.chapters.id, chapters[0]!.id));
    const before = await rows(publishedId);
    const rawBefore = await t.db
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, publishedId));

    const added = await addReady(publishedId, 'three.mp3', 30);
    const after = await rows(publishedId);
    // Not even their update time moved: the existing chapter rows were not written at all.
    const rawAfter = await t.db
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, publishedId));
    for (const row of rawBefore) expect(rawAfter.find((r) => r.id === row.id)).toEqual(row);

    expect(after.tracks.slice(0, 2)).toEqual(before.tracks);
    expect(after.chapters.slice(0, 2)).toEqual(before.chapters); // same ids, titles, positions, ranges
    expect(after.tracks[2]).toMatchObject({ id: added, position: 3, status: 'ready' });
    expect(after.chapters[2]).toMatchObject({
      position: 3,
      title: 'three',
      startSeconds: 150,
      endSeconds: 180,
    });
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, publishedId));
    expect(book!.durationSeconds).toBe(180);
    expect(book!.status).toBe('published');
  });

  it('does not touch a published book until the new part is ready', async () => {
    await addReady(publishedId, 'one.mp3', 100);
    const before = await rows(publishedId);
    const begun = await beginTrackUpload(t.db, {
      bookId: publishedId,
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 50,
    });
    if (!begun.ok) throw new Error();
    const during = await rows(publishedId);
    expect(during.chapters).toEqual(before.chapters);
    const [book] = await t.db.select().from(schema.books).where(eq(schema.books.id, publishedId));
    expect(book!.durationSeconds).toBe(100);
  });

  async function failedBeforeReady() {
    const first = await beginTrackUpload(t.db, {
      bookId: publishedId,
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 100,
    });
    if (!first.ok) throw new Error();
    await failTrackUpload(t.db, first.trackId, 'Storage refused the file (status 500).');
    const second = await addReady(publishedId, 'two.mp3', 50);
    return { failed: first.trackId, second };
  }

  it('does not retry a failed part in place when a ready part now follows it', async () => {
    const { failed } = await failedBeforeReady();
    const before = await rows(publishedId);
    const result = await restartTrackUpload(t.db, failed, {
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 100,
    });
    expect(result).toMatchObject({ ok: false, reason: 'wrong_state' });
    expect(result.ok === false && result.message).toMatch(/end of a published book/i);
    expect(await rows(publishedId)).toEqual(before);
  });

  it('lets the failed part go (remove it, add the file again at the end)', async () => {
    const { failed } = await failedBeforeReady();
    expect(await removeTrack(t.db, failed)).toEqual({ ok: true });
    const again = await addReady(publishedId, 'one.mp3', 100);
    const { tracks, chapters } = await rows(publishedId);
    expect(tracks.at(-1)!.id).toBe(again);
    expect(chapters.map((c) => [c.startSeconds, c.endSeconds])).toEqual([
      [0, 50],
      [50, 150],
    ]);
  });

  it('does retry a failed part in place when it is the last one', async () => {
    await addReady(publishedId, 'one.mp3', 100);
    const begun = await beginTrackUpload(t.db, {
      bookId: publishedId,
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 50,
    });
    if (!begun.ok) throw new Error();
    await failTrackUpload(t.db, begun.trackId, 'x');
    const retried = await restartTrackUpload(t.db, begun.trackId, {
      file: file('two.mp3'),
      hash: HASH,
      durationSeconds: 50,
    });
    expect(retried).toMatchObject({ ok: true });
    expect(await completeTrackUpload(t.db, begun.trackId, head(1000))).toEqual({ ok: true });
    expect((await rows(publishedId)).chapters.at(-1)).toMatchObject({
      startSeconds: 100,
      endSeconds: 150,
    });
  });

  it('fails the part instead of inserting it before a ready part when the book was published meanwhile', async () => {
    // Draft: part 1 is retried while part 2 is ready; then the book is published before it completes.
    const first = await beginTrackUpload(t.db, {
      bookId,
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 100,
    });
    if (!first.ok) throw new Error();
    await failTrackUpload(t.db, first.trackId, 'x');
    await addReady(bookId, 'two.mp3', 50);
    const retried = await restartTrackUpload(t.db, first.trackId, {
      file: file('one.mp3'),
      hash: HASH,
      durationSeconds: 100,
    });
    expect(retried).toMatchObject({ ok: true });
    await t.db.update(schema.books).set({ status: 'published' }).where(eq(schema.books.id, bookId));
    const before = (await rows(bookId)).chapters;

    const done = await completeTrackUpload(t.db, first.trackId, head(1000));
    expect(done).toMatchObject({ ok: false, reason: 'failed' });
    const after = await rows(bookId);
    expect(after.chapters).toEqual(before);
    expect(after.tracks.find((x) => x.id === first.trackId)).toMatchObject({ status: 'failed' });
    expect(after.tracks.find((x) => x.id === first.trackId)!.failureReason).toMatch(
      /end of a published book/i,
    );
  });
});

describe('getUploadingTrack', () => {
  it('gives the key, declared size and type of a part that is uploading in that book', async () => {
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('big.mp3', 150),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    expect(await getUploadingTrack(t.db, bookId, begun.trackId)).toEqual({
      key: begun.key,
      sizeBytes: 150,
      mimeType: 'audio/mpeg',
    });
  });

  it('gives nothing for a part that is not uploading, is in another book, or does not exist', async () => {
    const id = await addReady(bookId, 'a.mp3', 5);
    expect(await getUploadingTrack(t.db, bookId, id)).toBeNull();
    const begun = await beginTrackUpload(t.db, {
      bookId,
      file: file('b.mp3'),
      hash: HASH,
      durationSeconds: 5,
    });
    if (!begun.ok) throw new Error();
    expect(await getUploadingTrack(t.db, publishedId, begun.trackId)).toBeNull();
    expect(
      await getUploadingTrack(t.db, bookId, '00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
    expect(await getUploadingTrack(t.db, bookId, 'nope')).toBeNull();
  });
});
