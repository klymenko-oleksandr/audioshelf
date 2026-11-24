import { describe, expect, it } from 'vitest';
import { parseSigninError } from './signin-error';

describe('parseSigninError', () => {
  it('knows the two reasons and ignores everything else', () => {
    expect(parseSigninError('cancelled')).toBe('cancelled');
    expect(parseSigninError('failed')).toBe('failed');
    expect(parseSigninError(['failed', 'x'])).toBe('failed');
    expect(parseSigninError('<script>')).toBeNull();
    expect(parseSigninError(undefined)).toBeNull();
  });
});
