import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from './deadline';

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the result without touching the connection when the work is fast', async () => {
    const reset = vi.fn();
    const result = await withDeadline('x', async (db: string) => `${db}!`, {
      getHandle: () => 'db',
      reset,
      log: () => {},
    });
    expect(result).toBe('db!');
    expect(reset).not.toHaveBeenCalled();
  });

  it('drops the connection and retries once when the work never returns', async () => {
    const reset = vi.fn();
    const log = vi.fn();
    let handles = 0;
    const work = vi
      .fn<(db: number) => Promise<string>>()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(async () => 'ok');

    const pending = withDeadline('books-list', work, {
      getHandle: () => ++handles,
      reset,
      ms: 4_000,
      log,
    });
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(pending).resolves.toBe('ok');
    expect(reset).toHaveBeenCalledTimes(1);
    expect(work.mock.calls.map(([db]) => db)).toEqual([1, 2]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('books-list attempt 1/2 failed'));
  });

  it('gives up with the last error after the attempts are used', async () => {
    const reset = vi.fn();
    const pending = withDeadline('stuck', () => new Promise<never>(() => {}), {
      getHandle: () => 'db',
      reset,
      ms: 1_000,
      log: () => {},
    });
    const assertion = expect(pending).rejects.toThrow('stuck timed out after 1000 ms');
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('retries a failed query too, then throws its error', async () => {
    const work = vi.fn(async () => {
      throw new Error('relation does not exist');
    });
    await expect(
      withDeadline('bad', work, { getHandle: () => 'db', reset: () => {}, log: () => {} }),
    ).rejects.toThrow('relation does not exist');
    expect(work).toHaveBeenCalledTimes(2);
  });
});
