import { describe, expect, it } from 'vitest';
import { attentionNote, findAttention, type AttentionInput } from './attention';

const complete: AttentionInput = {
  status: 'published',
  hasAuthor: true,
  hasCategory: true,
  hasNarrator: true,
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
    expect(check({ hasNarrator: false })).toEqual([{ kind: 'missing', field: 'narrator' }]);
    expect(check({ readyTracks: 0 })).toEqual([{ kind: 'no-ready-track' }]);
  });

  it('applies the same rules to a scheduled book', () => {
    expect(check({ status: 'scheduled', hasAuthor: false })).toEqual([
      { kind: 'missing', field: 'author' },
    ]);
  });

  it('does not ask for a cover', () => {
    expect(check({})).toEqual([]);
  });

  it('leaves an unfinished draft alone: being incomplete is what a draft is', () => {
    expect(
      check({
        status: 'draft',
        hasAuthor: false,
        hasCategory: false,
        hasNarrator: false,
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
    expect(attentionNote([{ kind: 'missing', field: 'narrator' }])).toBe('Narrator missing');
    expect(attentionNote([{ kind: 'no-ready-track' }])).toBe('No ready track');
    expect(
      attentionNote([
        { kind: 'missing', field: 'author' },
        { kind: 'missing', field: 'category' },
        { kind: 'no-ready-track' },
      ]),
    ).toBe('Author missing · +2 more');
    expect(attentionNote([])).toBe('');
  });
});
