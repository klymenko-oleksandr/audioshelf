import { describe, expect, it, vi } from 'vitest';
import { resolveCallback } from './callback';

const origin = 'https://audioshelf.vercel.app';
const ok = async () => ({ error: null });

describe('resolveCallback', () => {
  it('exchanges the code and goes to next', async () => {
    const exchange = vi.fn(ok);
    const to = await resolveCallback(
      `${origin}/auth/callback?code=abc&next=%2Flibrary%3Ftab%3Dliked`,
      exchange,
    );
    expect(exchange).toHaveBeenCalledWith('abc');
    expect(to).toBe(`${origin}/library?tab=liked`);
  });

  it('goes Home when next is missing or unsafe', async () => {
    expect(await resolveCallback(`${origin}/auth/callback?code=abc`, ok)).toBe(`${origin}/`);
    expect(
      await resolveCallback(`${origin}/auth/callback?code=abc&next=%2F%2Fevil.example`, ok),
    ).toBe(`${origin}/`);
    expect(
      await resolveCallback(`${origin}/auth/callback?code=abc&next=https%3A%2F%2Fevil.example`, ok),
    ).toBe(`${origin}/`);
  });

  it('sends a refused sign-in back to /signin and keeps next', async () => {
    const to = await resolveCallback(
      `${origin}/auth/callback?error=access_denied&next=%2Fbook%2Ftry-tony`,
      ok,
    );
    expect(to).toBe(`${origin}/signin?error=cancelled&next=%2Fbook%2Ftry-tony`);
  });

  it('reports other provider errors as failed', async () => {
    const to = await resolveCallback(`${origin}/auth/callback?error=server_error`, ok);
    expect(to).toBe(`${origin}/signin?error=failed`);
  });

  it('fails when there is no code', async () => {
    const exchange = vi.fn(ok);
    const to = await resolveCallback(`${origin}/auth/callback?next=%2Flibrary`, exchange);
    expect(exchange).not.toHaveBeenCalled();
    expect(to).toBe(`${origin}/signin?error=failed&next=%2Flibrary`);
  });

  it('fails when the exchange is refused or throws', async () => {
    expect(
      await resolveCallback(`${origin}/auth/callback?code=bad`, async () => ({
        error: new Error('bad code'),
      })),
    ).toBe(`${origin}/signin?error=failed`);
    expect(
      await resolveCallback(`${origin}/auth/callback?code=bad`, async () => {
        throw new Error('network');
      }),
    ).toBe(`${origin}/signin?error=failed`);
  });
});
