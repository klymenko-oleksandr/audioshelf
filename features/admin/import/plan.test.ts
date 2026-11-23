import { describe, expect, it } from 'vitest';
import type { ImportPart } from './book-json';
import { MAX_NEW_PARTS, hashFromKey, planImport, type ExistingTrack } from './plan';

const HASH = 'ab12cd34'.repeat(8);
const OTHER = 'ffffffff'.repeat(8);

const part = (number: number, sha256 = HASH): ImportPart => ({
  number,
  title: `Part ${number}`,
  file: `${number}.mp3`,
  size: 1000,
  sha256,
  durationSeconds: 60,
});
const parts = (n: number, sha256 = HASH) =>
  Array.from({ length: n }, (_, i) => part(i + 1, sha256));

const track = (
  position: number,
  status: ExistingTrack['status'] = 'ready',
  hash8 = HASH.slice(0, 8),
): ExistingTrack => ({
  id: `track-${position}`,
  position,
  status,
  r2Key: `books/b/audio/${String(position).padStart(2, '0')}-part-${hash8}.mp3`,
});

const kinds = (plan: ReturnType<typeof planImport>) =>
  plan.actions.map((a) => `${a.number}:${a.kind}`);

describe('hashFromKey', () => {
  it('reads the 8 hex characters before the extension', () => {
    expect(hashFromKey('books/b/audio/03-title-3fa9c1d2.mp3')).toBe('3fa9c1d2');
    expect(hashFromKey('books/b/audio/03-3fa9c1d2.m4a')).toBe('3fa9c1d2');
  });
  it('returns undefined for keys that carry no hash (the v1 objects)', () => {
    expect(hashFromKey('audio/0b3f1c2e-4d5a.mp3')).toBeUndefined();
    expect(hashFromKey('books/b/audio/01-title.mp3')).toBeUndefined();
  });
});

describe('planImport: a new book', () => {
  it('plans every part as new, in order', () => {
    const plan = planImport({ bookStatus: 'draft', parts: parts(3), existing: [] });
    expect(kinds(plan)).toEqual(['1:new', '2:new', '3:new']);
    expect(plan.deferred).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });

  it('plans only a batch of new parts and defers the rest to the next request', () => {
    const plan = planImport({ bookStatus: 'draft', parts: parts(MAX_NEW_PARTS + 3), existing: [] });
    expect(plan.actions).toHaveLength(MAX_NEW_PARTS);
    expect(plan.deferred).toEqual([MAX_NEW_PARTS + 1, MAX_NEW_PARTS + 2, MAX_NEW_PARTS + 3]);
  });
});

describe('planImport: importing again', () => {
  it('skips parts that are already ready and appends only the new ones', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(4),
      existing: [track(1), track(2)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:skip', '3:new', '4:new']);
  });

  it('does nothing at all when every part is already there', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(2),
      existing: [track(1), track(2)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:skip']);
    expect(plan.deferred).toEqual([]);
  });

  it('reports a ready part whose file changed, and leaves it alone', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: [part(1, OTHER), part(2)],
      existing: [track(1), track(2)],
    });
    expect(kinds(plan)).toEqual(['1:changed', '2:skip']);
    expect(plan.warnings).toEqual([expect.stringContaining('Part 1')]);
  });

  it('does not complain about a part whose key carries no hash (a v1 book)', () => {
    const legacy: ExistingTrack = {
      id: 'legacy',
      position: 1,
      status: 'ready',
      r2Key: 'audio/old-file.mp3',
    };
    const plan = planImport({ bookStatus: 'published', parts: parts(2), existing: [legacy] });
    expect(kinds(plan)).toEqual(['1:skip', '2:new']);
    expect(plan.warnings).toEqual([]);
  });

  it('keeps a part the admin removed removed', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(5),
      existing: [track(1), track(2), track(4), track(5)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:skip', '3:removed', '4:skip', '5:skip']);
    expect(plan.warnings).toEqual([]);
  });

  it('appends after the highest position, not after the count of parts', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(6),
      existing: [track(1), track(2), track(4), track(5)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:skip', '3:removed', '4:skip', '5:skip', '6:new']);
  });

  it('accepts a list shorter than the book: the rest simply stays', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(1),
      existing: [track(1), track(2), track(3)],
    });
    expect(kinds(plan)).toEqual(['1:skip']);
  });
});

describe('planImport: an interrupted import', () => {
  it('resumes a part that failed', () => {
    const plan = planImport({
      bookStatus: 'draft',
      parts: parts(2),
      existing: [track(1), track(2, 'failed')],
    });
    expect(plan.actions[1]).toMatchObject({
      number: 2,
      kind: 'resume',
      trackId: 'track-2',
      failFirst: false,
    });
  });

  it('resumes a part that never finished uploading, failing it first', () => {
    const plan = planImport({
      bookStatus: 'draft',
      parts: parts(2),
      existing: [track(1), track(2, 'uploading')],
    });
    expect(plan.actions[1]).toMatchObject({ kind: 'resume', trackId: 'track-2', failFirst: true });
  });

  it('may resume a part with a different file: nothing listeners can see depends on it', () => {
    const plan = planImport({
      bookStatus: 'draft',
      parts: [part(1), part(2, OTHER)],
      existing: [track(1), track(2, 'failed')],
    });
    expect(plan.actions[1]).toMatchObject({ kind: 'resume' });
  });

  it('does not touch a part that is being processed, and plans nothing after it', () => {
    const plan = planImport({
      bookStatus: 'draft',
      parts: parts(4),
      existing: [track(1), track(2, 'processing')],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:busy']);
    expect(plan.deferred).toEqual([3, 4]);
    expect(plan.warnings).toEqual([expect.stringContaining('Part 2')]);
  });
});

describe('planImport: published books only grow at the end', () => {
  it('blocks resuming a failed part that has a ready part after it, and stops there', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(4),
      existing: [track(1), track(2, 'failed'), track(3)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:blocked', '3:skip']);
    expect(plan.deferred).toEqual([4]);
    expect(plan.warnings).toEqual([expect.stringContaining('Part 2')]);
  });

  it('lets a draft resume the same part', () => {
    const plan = planImport({
      bookStatus: 'draft',
      parts: parts(3),
      existing: [track(1), track(2, 'failed'), track(3)],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:resume', '3:skip']);
  });

  it('resumes the last failed part of a published book', () => {
    const plan = planImport({
      bookStatus: 'published',
      parts: parts(3),
      existing: [track(1), track(2), track(3, 'failed')],
    });
    expect(kinds(plan)).toEqual(['1:skip', '2:skip', '3:resume']);
  });
});

describe('planImport: ready parts are never written (property)', () => {
  // A small deterministic generator, so a failure can be reproduced.
  let seed = 12345;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  it('never plans work for a ready part, and only ever appends beyond the highest position', () => {
    const statuses: ExistingTrack['status'][] = [
      'ready',
      'ready',
      'ready',
      'failed',
      'uploading',
      'processing',
    ];
    for (let round = 0; round < 500; round++) {
      const count = next(8);
      const positions = new Set<number>();
      while (positions.size < count) positions.add(1 + next(10));
      const existing = [...positions].map((p) =>
        track(p, statuses[next(statuses.length)], next(2) ? HASH.slice(0, 8) : OTHER.slice(0, 8)),
      );
      const bookStatus = next(2) ? 'published' : 'draft';
      const plan = planImport({ bookStatus, parts: parts(1 + next(14)), existing });
      const highest = Math.max(0, ...existing.map((e) => e.position));

      for (const action of plan.actions) {
        const there = existing.find((e) => e.position === action.number);
        if (action.kind === 'new') {
          expect(there, JSON.stringify({ existing, action })).toBeUndefined();
          expect(action.number).toBeGreaterThan(highest);
        }
        if (action.kind === 'resume') expect(there?.status).not.toBe('ready');
        if (there?.status === 'ready') expect(['skip', 'changed']).toContain(action.kind);
      }
      // Planned and deferred parts cover each part once, in order.
      const covered = [...plan.actions.map((a) => a.number), ...plan.deferred];
      expect(covered).toEqual([...covered].sort((a, b) => a - b));
      expect(new Set(covered).size).toBe(covered.length);
    }
  });
});
