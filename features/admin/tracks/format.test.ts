import { describe, expect, it } from 'vitest';
import { formatClock, formatFileSize } from './format';

describe('formatClock', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59.4)).toBe('0:59');
    expect(formatClock(605)).toBe('10:05');
  });

  it('adds hours from one hour up', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3725.9)).toBe('1:02:05');
  });

  it('rounds down, never shows a negative or broken value', () => {
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('formatFileSize', () => {
  it('uses KB below a megabyte and MB above', () => {
    expect(formatFileSize(0)).toBe('0 KB');
    expect(formatFileSize(1536)).toBe('2 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(29.46 * 1024 * 1024)).toBe('29.5 MB');
  });
});
