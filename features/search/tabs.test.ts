import { describe, expect, it } from 'vitest';
import { MAX_QUERY_LENGTH, parseQuery, parseSearchTab, searchHref } from './tabs';

describe('search url helpers', () => {
  it('reads a tab, defaulting to all', () => {
    expect(parseSearchTab('books')).toBe('books');
    expect(parseSearchTab(['authors', 'books'])).toBe('authors');
    expect(parseSearchTab('nope')).toBe('all');
    expect(parseSearchTab(undefined)).toBe('all');
  });

  it('trims and limits the query', () => {
    expect(parseQuery('  holmes ')).toBe('holmes');
    expect(parseQuery(['a', 'b'])).toBe('a');
    expect(parseQuery(undefined)).toBe('');
    expect(parseQuery('x'.repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });

  it('builds a link that survives odd characters', () => {
    expect(searchHref('перстень')).toBe(
      '/search?q=%D0%BF%D0%B5%D1%80%D1%81%D1%82%D0%B5%D0%BD%D1%8C',
    );
    expect(searchHref('a&b=c', 'books')).toBe('/search?q=a%26b%3Dc&tab=books');
  });
});
