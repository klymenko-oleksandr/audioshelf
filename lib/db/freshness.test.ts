import { describe, expect, it } from 'vitest';
import { isStale, MAX_IDLE_MS } from './freshness';

describe('isStale', () => {
  it('keeps a connection that was used a moment ago', () => {
    expect(isStale(1_000, 1_000 + MAX_IDLE_MS)).toBe(false);
  });

  it('replaces a connection that sat unused for longer than the limit: the instance may have been frozen and the socket is dead', () => {
    expect(isStale(1_000, 1_000 + MAX_IDLE_MS + 1)).toBe(true);
  });

  it('treats a clock that went backwards as fresh', () => {
    expect(isStale(5_000, 1_000)).toBe(false);
  });
});
