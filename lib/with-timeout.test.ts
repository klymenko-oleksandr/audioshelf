import { describe, expect, it } from 'vitest';
import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('returns the value when the work finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 50, 'x')).resolves.toBe(7);
  });

  it('rejects with the label when the work takes too long', async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 20, 'sign-in')).rejects.toThrow('sign-in timed out after 20 ms');
  });

  it('passes the original error through', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'x')).rejects.toThrow('boom');
  });
});
