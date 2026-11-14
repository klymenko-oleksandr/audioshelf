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
});
