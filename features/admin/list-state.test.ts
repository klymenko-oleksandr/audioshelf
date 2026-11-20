import { describe, expect, it } from 'vitest';
import {
  buildBooksHref,
  DEFAULT_SORT,
  parseBooksQuery,
  safeSearchText,
  type BooksQuery,
} from './list-state';

describe('parseBooksQuery', () => {
  it('uses the defaults for an empty query', () => {
    expect(parseBooksQuery({})).toEqual({ tab: 'all', q: '', category: '', sort: DEFAULT_SORT });
  });

  it('reads known values', () => {
    expect(
      parseBooksQuery({ tab: 'attention', q: ' тони ', category: 'fiction', sort: 'title' }),
    ).toEqual({ tab: 'attention', q: 'тони', category: 'fiction', sort: 'title' });
  });

  it('ignores unknown values and takes the first of repeated ones', () => {
    expect(parseBooksQuery({ tab: 'nonsense', sort: 'drop table', q: ['a', 'b'] })).toEqual({
      tab: 'all',
      q: 'a',
      category: '',
      sort: DEFAULT_SORT,
    });
  });

  it('limits the search text', () => {
    expect(parseBooksQuery({ q: 'x'.repeat(500) }).q).toHaveLength(100);
  });
});

describe('buildBooksHref', () => {
  const base: BooksQuery = { tab: 'all', q: '', category: '', sort: DEFAULT_SORT };

  it('leaves defaults out of the URL', () => {
    expect(buildBooksHref(base)).toBe('/admin/books');
  });

  it('keeps what is set and encodes it', () => {
    expect(
      buildBooksHref({ tab: 'draft', q: 'Три тони', category: 'fiction', sort: 'title' }),
    ).toBe(
      '/admin/books?tab=draft&q=%D0%A2%D1%80%D0%B8+%D1%82%D0%BE%D0%BD%D0%B8&category=fiction&sort=title',
    );
  });

  it('applies a change on top of the current state', () => {
    expect(buildBooksHref({ ...base, q: 'a' }, { tab: 'published' })).toBe(
      '/admin/books?tab=published&q=a',
    );
  });
});

describe('safeSearchText', () => {
  it('folds case and accents, so "Перстень" finds "перстень" and "cafe" finds "café"', () => {
    expect(safeSearchText('Перстень')).toBe(safeSearchText('перстень'));
    expect(safeSearchText('Café')).toBe('cafe');
  });
});
