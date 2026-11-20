import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_PATH, loginHref, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/admin/books', '/admin/books'],
    ['/admin/books?tab=draft&q=a', '/admin/books?tab=draft&q=a'],
    ['/admin/books/123', '/admin/books/123'],
    ['/admin', '/admin'],
  ])('keeps an admin path (%s)', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    '/',
    '/book/x',
    'https://evil.example/admin/books',
    '//evil.example/admin',
    '/\\evil.example',
    '/admin/../library',
    '/administrator',
    '/admin/login',
    '/admin/login?next=/admin/books',
    'admin/books',
    'javascript:alert(1)',
    '/admin/books\nSet-Cookie: x=1',
  ])('falls back to the books list for %s', (input) => {
    expect(safeNextPath(input)).toBe(DEFAULT_ADMIN_PATH);
  });
});

describe('loginHref', () => {
  it('goes to the login page and remembers where to return', () => {
    expect(loginHref('/admin/books', '?tab=draft')).toBe(
      '/admin/login?next=%2Fadmin%2Fbooks%3Ftab%3Ddraft',
    );
  });

  it('does not remember the books list, which is where login goes anyway', () => {
    expect(loginHref('/admin/books', '')).toBe('/admin/login');
    expect(loginHref('/admin', '')).toBe('/admin/login');
  });

  it('does not remember a path that is not admin', () => {
    expect(loginHref('/elsewhere', '')).toBe('/admin/login');
  });
});
