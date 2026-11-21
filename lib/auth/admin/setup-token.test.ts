import { describe, expect, it } from 'vitest';
import { isSetupEnabled, isSetupTokenValid } from './setup-token';

const TOKEN = 'x'.repeat(32);

describe('setup token', () => {
  it('is switched off unless the variable holds at least 32 characters', () => {
    expect(isSetupEnabled(undefined)).toBe(false);
    expect(isSetupEnabled('')).toBe(false);
    expect(isSetupEnabled('short')).toBe(false);
    expect(isSetupEnabled(TOKEN)).toBe(true);
  });

  it('accepts only the exact token', () => {
    expect(isSetupTokenValid(TOKEN, TOKEN)).toBe(true);
    expect(isSetupTokenValid(TOKEN + 'y', TOKEN)).toBe(false);
    expect(isSetupTokenValid('y'.repeat(32), TOKEN)).toBe(false);
    expect(isSetupTokenValid('', TOKEN)).toBe(false);
  });

  it('never accepts anything while switched off, not even an empty or short match', () => {
    expect(isSetupTokenValid('short', 'short')).toBe(false);
    expect(isSetupTokenValid('', undefined)).toBe(false);
    expect(isSetupTokenValid(undefined, TOKEN)).toBe(false);
  });
});
