import { describe, expect, it } from 'vitest';
import { confirmationMatches } from './confirmation';

describe('confirmationMatches', () => {
  it('accepts the exact title', () => {
    expect(confirmationMatches('Dracula', 'Dracula')).toBe(true);
  });

  it('ignores case, outer spaces and repeated spaces', () => {
    expect(confirmationMatches('  dracula ', 'Dracula')).toBe(true);
    expect(confirmationMatches('Братство   Персня', 'Братство персня')).toBe(true);
  });

  it('treats composed and decomposed letters as the same (й, ї)', () => {
    expect(confirmationMatches('Майстер', 'Майстер')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(confirmationMatches('Drac', 'Dracula')).toBe(false);
    expect(confirmationMatches('Dracula 2', 'Dracula')).toBe(false);
    expect(confirmationMatches('', 'Dracula')).toBe(false);
  });

  it('never matches when the title itself is blank', () => {
    expect(confirmationMatches('', '')).toBe(false);
    expect(confirmationMatches('  ', '  ')).toBe(false);
  });
});
