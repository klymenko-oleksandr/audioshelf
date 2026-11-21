import { describe, expect, it } from 'vitest';
import { relyingParty } from './relying-party';

const h = (init: Record<string, string>) => new Headers(init);

describe('relyingParty', () => {
  it('uses the public host and https on Vercel', () => {
    expect(
      relyingParty(
        h({ 'x-forwarded-host': 'audioshelf.vercel.app', 'x-forwarded-proto': 'https' }),
      ),
    ).toEqual({ rpID: 'audioshelf.vercel.app', origin: 'https://audioshelf.vercel.app' });
  });

  it('keeps the port in the origin but not in the id (local runs)', () => {
    expect(relyingParty(h({ host: 'localhost:3000' }))).toEqual({
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    });
  });

  it('takes the first value when a proxy sends several', () => {
    expect(
      relyingParty(
        h({ 'x-forwarded-host': 'a.example, b.example', 'x-forwarded-proto': 'https, http' }),
      ),
    ).toEqual({ rpID: 'a.example', origin: 'https://a.example' });
  });

  it('is null without a usable host', () => {
    expect(relyingParty(h({}))).toBeNull();
    expect(relyingParty(h({ host: 'bad host/with slash' }))).toBeNull();
  });
});
