import { describe, expect, it } from 'vitest';
import { formatClock, formatRemaining, formatSpeed, splitDuration } from './format';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [75, '1:15'],
    [1634.9, '27:14'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3723, '1:02:03'],
    [44871, '12:27:51'],
  ])('%d s → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  it('treats bad input as zero', () => {
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  it('uses a real minus sign and rounds up, so it reaches 0:00 only at the end', () => {
    expect(formatRemaining(1526)).toBe('−25:26');
    expect(formatRemaining(0.4)).toBe('−0:01');
    expect(formatRemaining(0)).toBe('−0:00');
    expect(formatRemaining(-3)).toBe('−0:00');
  });
});

describe('splitDuration', () => {
  it('gives whole hours and minutes, rounded to the minute', () => {
    expect(splitDuration(37_440)).toEqual({ hours: 10, minutes: 24 });
    expect(splitDuration(1500)).toEqual({ hours: 0, minutes: 25 });
    expect(splitDuration(3570)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(20)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(Number.NaN)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('formatSpeed', () => {
  it('drops trailing zeros', () => {
    expect(formatSpeed(1)).toBe('1×');
    expect(formatSpeed(1.25)).toBe('1.25×');
    expect(formatSpeed(0.5)).toBe('0.5×');
    expect(formatSpeed(1.5000001)).toBe('1.5×');
  });
});
