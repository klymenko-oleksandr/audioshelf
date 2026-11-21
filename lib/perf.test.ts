import { describe, expect, it, vi } from 'vitest';
import { timed } from './perf';

function clock(...times: number[]) {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)]!;
}

describe('timed', () => {
  it('logs how long the work took and returns its result', async () => {
    const log = vi.fn();
    const result = await timed('page.books', async () => 42, {
      log,
      now: clock(1000, 1234.6),
      region: 'fra1',
    });
    expect(result).toBe(42);
    expect(log).toHaveBeenCalledWith('[perf] page.books 235ms region=fra1');
  });

  it('logs a failure with its duration and still throws the original error', async () => {
    const log = vi.fn();
    const boom = new Error('boom');
    await expect(
      timed('page.books', () => Promise.reject(boom), { log, now: clock(0, 50), region: 'fra1' }),
    ).rejects.toBe(boom);
    expect(log).toHaveBeenCalledWith('[perf] page.books failed after 50ms region=fra1: boom');
  });

  it('says "local" when there is no Vercel region', async () => {
    const log = vi.fn();
    await timed('x', async () => 1, { log, now: clock(0, 1), region: undefined });
    expect(log).toHaveBeenCalledWith('[perf] x 1ms region=local');
  });
});
