import { describe, expect, it } from 'vitest';
import { isActivePath } from './nav';

describe('isActivePath', () => {
  it('matches home only exactly', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/explore', '/')).toBe(false);
  });

  it('matches a section and the pages below it', () => {
    expect(isActivePath('/settings', '/settings')).toBe(true);
    expect(isActivePath('/settings/playback', '/settings')).toBe(true);
  });

  it('does not match a different section with the same prefix', () => {
    expect(isActivePath('/library-old', '/library')).toBe(false);
    expect(isActivePath('/explore', '/library')).toBe(false);
  });

  it('counts the extra sections of a nav item as that item', () => {
    const also = ['/category', '/author'];
    expect(isActivePath('/category/fiction', '/explore', also)).toBe(true);
    expect(isActivePath('/author/lesia-ukrainka', '/explore', also)).toBe(true);
    expect(isActivePath('/book/kobzar', '/explore', also)).toBe(false);
    expect(isActivePath('/categories', '/explore', also)).toBe(false);
  });
});
