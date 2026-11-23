import { describe, expect, it } from 'vitest';
import {
  canPublishFrom,
  canUnpublishFrom,
  describeMissing,
  findMissing,
  type PublishCandidate,
} from './rules';

const complete: PublishCandidate = {
  title: 'Сіддхартха',
  hasAuthor: true,
  hasCategory: true,
  hasNarrator: true,
  readyTracks: 1,
};

describe('findMissing', () => {
  it('finds nothing missing on a complete book', () => {
    expect(findMissing(complete)).toEqual([]);
  });

  it('asks for a title, an author, a category, a narrator and a ready track, in that order', () => {
    expect(
      findMissing({
        title: '',
        hasAuthor: false,
        hasCategory: false,
        hasNarrator: false,
        readyTracks: 0,
      }),
    ).toEqual(['title', 'author', 'category', 'narrator', 'ready-track']);
  });

  it('reports each gap on its own', () => {
    expect(findMissing({ ...complete, hasAuthor: false })).toEqual(['author']);
    expect(findMissing({ ...complete, hasCategory: false })).toEqual(['category']);
    expect(findMissing({ ...complete, hasNarrator: false })).toEqual(['narrator']);
    expect(findMissing({ ...complete, readyTracks: 0 })).toEqual(['ready-track']);
  });

  it('treats a blank title as missing', () => {
    expect(findMissing({ ...complete, title: '   ' })).toEqual(['title']);
  });

  it('does not ask for a cover: the app shows designed covers and cover upload is parked', () => {
    expect(findMissing(complete)).not.toContain('cover');
  });
});

describe('describeMissing', () => {
  it('is empty when nothing is missing', () => {
    expect(describeMissing([])).toBe('');
  });

  it('names one gap', () => {
    expect(describeMissing(['author'])).toBe('Missing: author');
  });

  it('lists several in plain words', () => {
    expect(describeMissing(['author', 'narrator', 'ready-track'])).toBe(
      'Missing: author, narrator, a ready audio track',
    );
  });
});

describe('which statuses can move', () => {
  it('publishes a draft or a scheduled book, not one that is already published', () => {
    expect(canPublishFrom('draft')).toBe(true);
    expect(canPublishFrom('scheduled')).toBe(true);
    expect(canPublishFrom('published')).toBe(false);
  });

  it('unpublishes a published or scheduled book back to draft, not a draft', () => {
    expect(canUnpublishFrom('published')).toBe(true);
    expect(canUnpublishFrom('scheduled')).toBe(true);
    expect(canUnpublishFrom('draft')).toBe(false);
  });
});
