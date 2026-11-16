import { describe, expect, it } from 'vitest';
import { parseBookSort, sortBooks, sortHref } from './sort';

describe('parseBookSort', () => {
  it('accepts the three sorts', () => {
    expect(parseBookSort('newest')).toBe('newest');
    expect(parseBookSort('length')).toBe('length');
    expect(parseBookSort('title')).toBe('title');
  });

  it('falls back to newest for anything else', () => {
    expect(parseBookSort(undefined)).toBe('newest');
    expect(parseBookSort('')).toBe('newest');
    expect(parseBookSort('popular')).toBe('newest');
    expect(parseBookSort('TITLE')).toBe('newest');
  });

  it('takes the first value when the parameter is repeated', () => {
    expect(parseBookSort(['length', 'title'])).toBe('length');
    expect(parseBookSort([])).toBe('newest');
  });
});

describe('sortHref', () => {
  it('keeps the default out of the URL', () => {
    expect(sortHref('/category/fiction', 'newest')).toBe('/category/fiction');
    expect(sortHref('/category/fiction', 'length')).toBe('/category/fiction?sort=length');
    expect(sortHref('/explore', 'title')).toBe('/explore?sort=title');
  });
});

describe('sortBooks', () => {
  // Newest first, as the queries return them.
  const books = [
    { title: 'Яблуневий сад', durationSeconds: 7200 },
    { title: 'Іліада', durationSeconds: 3600 },
    { title: 'Єретик', durationSeconds: 3600 },
    { title: 'Animal Farm', durationSeconds: 10800 },
    { title: 'Ґудзик', durationSeconds: 600 },
    { title: 'Том 10', durationSeconds: 900 },
    { title: 'Том 2', durationSeconds: 1200 },
  ];
  const titles = (sort: Parameters<typeof sortBooks>[1]) =>
    sortBooks(books, sort).map((book) => book.title);

  it('newest keeps the order it was given', () => {
    expect(titles('newest')).toEqual(books.map((book) => book.title));
  });

  it('length puts the shortest first; equal lengths stay newest first', () => {
    expect(titles('length')).toEqual([
      'Ґудзик',
      'Том 10',
      'Том 2',
      'Іліада',
      'Єретик',
      'Яблуневий сад',
      'Animal Farm',
    ]);
  });

  it('title follows the Ukrainian alphabet (Ґ, Є, І in their places), numbers by value, Latin titles last', () => {
    expect(titles('title')).toEqual([
      'Ґудзик',
      'Єретик',
      'Іліада',
      'Том 2',
      'Том 10',
      'Яблуневий сад',
      'Animal Farm',
    ]);
  });

  it('does not change the list it was given', () => {
    const before = books.map((book) => book.title);
    sortBooks(books, 'title');
    expect(books.map((book) => book.title)).toEqual(before);
  });
});
