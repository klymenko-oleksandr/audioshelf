import { describe, expect, it } from 'vitest';
import { callbackUrl, safeNextPath } from './next';

describe('safeNextPath', () => {
  it('keeps an in-app path with its query and hash', () => {
    expect(safeNextPath('/book/try-tony?tab=about')).toBe('/book/try-tony?tab=about');
    expect(safeNextPath('/library?tab=liked&sort=title')).toBe('/library?tab=liked&sort=title');
    expect(safeNextPath('/')).toBe('/');
  });

  it.each([
    ['https://evil.example/', 'absolute URL'],
    ['//evil.example/', 'protocol-relative URL'],
    ['/\\evil.example', 'backslash trick'],
    ['\\\\evil.example', 'backslashes'],
    ['javascript:alert(1)', 'script scheme'],
    ['book/try-tony', 'no leading slash'],
    ['/book/\nx', 'control character'],
    ['/book/\u0000x', 'null byte'],
    ['', 'empty'],
  ])('falls back for %s (%s)', (raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });

  it('never returns to the sign-in page or the callback (no loops)', () => {
    expect(safeNextPath('/signin')).toBe('/');
    expect(safeNextPath('/signin?next=%2F')).toBe('/');
    expect(safeNextPath('/auth/callback?code=1')).toBe('/');
  });

  it('keeps admin paths out of the listener flow', () => {
    expect(safeNextPath('/admin/books')).toBe('/');
    expect(safeNextPath('/api/admin/import')).toBe('/');
  });

  it('handles missing and repeated values', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(['/library', '/search'])).toBe('/library');
    expect(safeNextPath('/x', '/library')).toBe('/x');
    expect(safeNextPath('//bad', '/library')).toBe('/library');
  });

  it('cuts very long values', () => {
    expect(safeNextPath(`/${'a'.repeat(3000)}`)).toBe('/');
  });
});

describe('callbackUrl', () => {
  it('points at the callback route with the next path encoded', () => {
    expect(callbackUrl('https://audioshelf.vercel.app', '/book/try-tony?tab=about')).toBe(
      'https://audioshelf.vercel.app/auth/callback?next=%2Fbook%2Ftry-tony%3Ftab%3Dabout',
    );
  });

  it('sanitises next on the way in', () => {
    expect(callbackUrl('http://localhost:3000', '//evil.example')).toBe(
      'http://localhost:3000/auth/callback?next=%2F',
    );
  });
});
