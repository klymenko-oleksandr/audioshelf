import { describe, expect, it } from 'vitest';
import { classifyDb, SLOW_DB_MS } from './health';

describe('classifyDb', () => {
  it('is ok for a fast answer', () => {
    expect(classifyDb({ ms: 80 })).toEqual({ db: 'ok', dbMs: 80 });
  });

  it('is slow when the answer took SLOW_DB_MS or more', () => {
    expect(classifyDb({ ms: SLOW_DB_MS - 1 }).db).toBe('ok');
    expect(classifyDb({ ms: SLOW_DB_MS }).db).toBe('slow');
  });

  it('is down, with no timing, when the check failed or timed out', () => {
    expect(classifyDb({ failed: true })).toEqual({ db: 'down', dbMs: null });
  });
});
