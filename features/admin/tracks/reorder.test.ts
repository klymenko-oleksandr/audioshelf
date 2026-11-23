import { describe, expect, it } from 'vitest';
import { planReorder, type ReorderChapter, type ReorderTrack } from './reorder';

const track = (
  id: string,
  position: number,
  durationSeconds: number,
  extra: Partial<ReorderTrack> = {},
): ReorderTrack => ({
  id,
  position,
  durationSeconds,
  status: 'ready',
  title: `Part ${id}`,
  ...extra,
});
const chapter = (
  id: string,
  title: string,
  startSeconds: number,
  endSeconds: number,
): ReorderChapter => ({
  id,
  title,
  startSeconds,
  endSeconds,
});

// A (100 s), B (50 s), C (25 s): one chapter each, as uploading makes them.
const tracks = [track('a', 1, 100), track('b', 2, 50), track('c', 3, 25)];
const chapters = [
  chapter('ca', 'Part a', 0, 100),
  chapter('cb', 'Part b', 100, 150),
  chapter('cc', 'Part c', 150, 175),
];

describe('planReorder', () => {
  it('numbers the parts 1..N in the new order and rebuilds one chapter per ready part from the new timeline', () => {
    const plan = planReorder(tracks, chapters, ['c', 'a', 'b']);
    expect(plan).toMatchObject({ ok: true, changed: true });
    if (!plan.ok) return;
    expect(plan.positions).toEqual([
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
      { id: 'b', position: 3 },
    ]);
    expect(plan.chapters).toEqual([
      { title: 'Part c', startSeconds: 0, endSeconds: 25 },
      { title: 'Part a', startSeconds: 25, endSeconds: 125 },
      { title: 'Part b', startSeconds: 125, endSeconds: 175 },
    ]);
  });

  it('keeps the book length: the new chapters end exactly where the old ones did', () => {
    const plan = planReorder(tracks, chapters, ['b', 'c', 'a']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.durationSeconds).toBe(175);
    expect(plan.chapters.at(-1)!.endSeconds).toBe(175);
  });

  it('keeps a custom chapter title with the part it belonged to, wherever that part moves', () => {
    const renamed = [chapters[0]!, { ...chapters[1]!, title: 'The storm' }, chapters[2]!];
    const plan = planReorder(tracks, renamed, ['b', 'a', 'c']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.chapters.map((c) => c.title)).toEqual(['The storm', 'Part a', 'Part c']);
  });

  it('keeps a chapter title that differs from the part title (the chapter was renamed, the part was not)', () => {
    const renamed = [{ ...chapters[0]!, title: 'Prologue' }, chapters[1]!, chapters[2]!];
    const plan = planReorder(tracks, renamed, ['c', 'b', 'a']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.chapters.map((c) => c.title)).toEqual(['Part c', 'Part b', 'Prologue']);
  });

  it('uses the part title when the part has no chapter that maps to it alone', () => {
    // One chapter spans parts a and b; part c has none.
    const odd = [chapter('x', 'Both', 0, 150)];
    const plan = planReorder(tracks, odd, ['b', 'a', 'c']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.chapters.map((c) => c.title)).toEqual(['Part b', 'Part a', 'Part c']);
  });

  it('uses the part title when a part holds more than one chapter, instead of guessing which to keep', () => {
    const split = [
      chapter('a1', 'First half', 0, 50),
      chapter('a2', 'Second half', 50, 100),
      chapters[1]!,
      chapters[2]!,
    ];
    const plan = planReorder(tracks, split, ['b', 'a', 'c']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.chapters.map((c) => c.title)).toEqual(['Part b', 'Part a', 'Part c']);
  });

  it('leaves parts that are not ready out of the timeline but still gives them a position', () => {
    const mixed = [
      track('a', 1, 100),
      track('f', 2, 70, { status: 'failed' }),
      track('c', 3, 25),
      track('u', 4, 10, { status: 'uploading' }),
    ];
    const mixedChapters = [chapter('ca', 'Part a', 0, 100), chapter('cc', 'Part c', 100, 125)];
    const plan = planReorder(mixed, mixedChapters, ['u', 'c', 'f', 'a']);
    if (!plan.ok) throw new Error('expected ok');
    expect(plan.positions.map((p) => p.id)).toEqual(['u', 'c', 'f', 'a']);
    expect(plan.chapters).toEqual([
      { title: 'Part c', startSeconds: 0, endSeconds: 25 },
      { title: 'Part a', startSeconds: 25, endSeconds: 125 },
    ]);
    expect(plan.durationSeconds).toBe(125);
  });

  it('reports no change for the order the book already has, even when positions had gaps', () => {
    const gaps = [track('a', 1, 100), track('b', 4, 50), track('c', 9, 25)];
    const plan = planReorder(gaps, chapters, ['a', 'b', 'c']);
    expect(plan).toMatchObject({ ok: true, changed: false });
  });

  it("refuses a list that is not exactly the book's parts: missing, extra, duplicated or unknown ids", () => {
    for (const order of [['a', 'b'], ['a', 'b', 'c', 'd'], ['a', 'a', 'b'], ['a', 'b', 'x'], []]) {
      expect(planReorder(tracks, chapters, order)).toEqual({ ok: false, reason: 'mismatch' });
    }
  });

  it('handles a book with no parts and one with a single part', () => {
    expect(planReorder([], [], [])).toMatchObject({ ok: true, changed: false, chapters: [] });
    expect(planReorder([tracks[0]!], [chapters[0]!], ['a'])).toMatchObject({
      ok: true,
      changed: false,
    });
  });

  it('does not change its input', () => {
    const before = JSON.stringify([tracks, chapters]);
    planReorder(tracks, chapters, ['c', 'b', 'a']);
    expect(JSON.stringify([tracks, chapters])).toBe(before);
  });
});
