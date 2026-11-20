import { describe, expect, it } from 'vitest';
import { attentionNote, findAttention, type AttentionInput } from './attention';

const complete: AttentionInput = {
  status: 'published',
  hasAuthor: true,
  hasCategory: true,
  hasCover: true,
  readyTracks: 3,
  failedTrackPositions: [],
};
const check = (patch: Partial<AttentionInput>) => findAttention({ ...complete, ...patch });

describe('findAttention', () => {
  it('has nothing to say about a complete book', () => {
    expect(check({})).toEqual([]);
  });

  it('flags the fields a live book must have (PRD: publish rules)', () => {
    expect(check({ hasAuthor: false })).toEqual([{ kind: 'missing', field: 'author' }]);
    expect(check({ hasCategory: false })).toEqual([{ kind: 'missing', field: 'category' }]);
    expect(check({ hasCover: false })).toEqual([{ kind: 'missing', field: 'cover' }]);
    expect(check({ readyTracks: 0 })).toEqual([{ kind: 'no-ready-track' }]);
  });

  it('applies the same rules to a scheduled book', () => {
    expect(check({ status: 'scheduled', hasCover: false })).toEqual([
      { kind: 'missing', field: 'cover' },
    ]);
  });

  it('leaves an unfinished draft alone: being incomplete is what a draft is', () => {
    expect(
      check({
        status: 'draft',
        hasAuthor: false,
        hasCategory: false,
        hasCover: false,
        readyTracks: 0,
      }),
    ).toEqual([]);
  });

  it('flags a failed track on any book, drafts included', () => {
    expect(check({ failedTrackPositions: [4] })).toEqual([
      { kind: 'failed-track', positions: [4] },
    ]);
    expect(check({ status: 'draft', failedTrackPositions: [2, 5] })).toEqual([
      { kind: 'failed-track', positions: [2, 5] },
    ]);
  });

  it('lists every problem, failed tracks first', () => {
    expect(check({ hasAuthor: false, readyTracks: 0, failedTrackPositions: [1] })).toEqual([
      { kind: 'failed-track', positions: [1] },
      { kind: 'missing', field: 'author' },
      { kind: 'no-ready-track' },
    ]);
  });
});

describe('attentionNote', () => {
  it('words the first problem for the list row and counts the rest', () => {
    expect(attentionNote([{ kind: 'failed-track', positions: [4] }])).toBe('Track 4 failed');
    expect(attentionNote([{ kind: 'failed-track', positions: [2, 5] }])).toBe('Tracks 2, 5 failed');
    expect(attentionNote([{ kind: 'missing', field: 'cover' }])).toBe('Cover missing');
    expect(attentionNote([{ kind: 'no-ready-track' }])).toBe('No ready track');
    expect(
      attentionNote([
        { kind: 'missing', field: 'author' },
        { kind: 'missing', field: 'cover' },
        { kind: 'no-ready-track' },
      ]),
    ).toBe('Author missing · +2 more');
    expect(attentionNote([])).toBe('');
  });
});
