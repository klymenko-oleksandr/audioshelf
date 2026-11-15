import { describe, expect, it } from 'vitest';
import { buildTimeline, validateBook } from '../core';
import { findBookById, findBookBySlug, STATIC_BOOKS, TEST_BOOK } from './static-books';

describe('static books', () => {
  it('has the four v1 books', () => {
    expect(STATIC_BOOKS.map((b) => b.title)).toEqual([
      'Сіддхартха',
      'Колгосп тварин',
      'Пригоди барона Мюнхаузена',
      'Братство персня',
    ]);
    expect(STATIC_BOOKS.map((b) => b.chapters.length)).toEqual([12, 8, 1, 17]);
  });

  it.each([...STATIC_BOOKS, TEST_BOOK].map((book) => [book.title, book] as const))(
    '%s is playable',
    (_title, book) => {
      expect(validateBook(book)).toEqual([]);
    },
  );

  it('matches the v1 totals (within a second)', () => {
    const totals = STATIC_BOOKS.map((b) => Math.round(buildTimeline(b.tracks).duration));
    expect(totals[0]).toBeCloseTo(20291, -1);
    expect(totals[1]).toBeCloseTo(6363, -1);
    expect(totals[2]).toBeCloseTo(6154, -1);
    expect(totals[3]).toBeCloseTo(44871, -1);
  });

  it('builds encoded public URLs for the v1 objects', () => {
    const [first] = STATIC_BOOKS[0]!.tracks;
    expect(first!.url).toMatch(/^https:\/\/.+\/audio\/1766266774001-uzc5s8-01\.[_.]+mp3$/);
    expect(STATIC_BOOKS[0]!.coverUrl).toContain('/covers/');
  });

  it('has unique ids and slugs and finds books by either', () => {
    const all = [...STATIC_BOOKS, TEST_BOOK];
    expect(new Set(all.map((b) => b.id)).size).toBe(all.length);
    expect(new Set(all.map((b) => b.slug)).size).toBe(all.length);
    expect(findBookBySlug('hesse-siddhartha')?.title).toBe('Сіддхартха');
    expect(findBookById('test-book')).toBe(TEST_BOOK);
    expect(findBookById('nope')).toBeUndefined();
  });
});
