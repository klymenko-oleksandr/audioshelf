import { describe, expect, it } from 'vitest';
import { toneFor } from './book-cover';

describe('toneFor', () => {
  it('is stable for the same book', () => {
    expect(toneFor('kobzar')).toBe(toneFor('kobzar'));
  });

  it('handles Cyrillic and empty seeds', () => {
    expect(typeof toneFor('Кобзар')).toBe('string');
    expect(typeof toneFor('')).toBe('string');
  });

  it('spreads books across several tones', () => {
    const tones = new Set(
      ['kobzar', 'holmes', 'dracula', 'alice', 'forest-song', 'treasure', 'time', 'pride'].map(
        toneFor,
      ),
    );
    expect(tones.size).toBeGreaterThanOrEqual(3);
  });
});
