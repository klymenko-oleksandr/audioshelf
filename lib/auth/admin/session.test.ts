// @vitest-environment node
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_SECONDS,
  adminCookieOptions,
  createSessionToken,
  verifySessionToken,
} from './session';

const SECRET = 'x'.repeat(48);
const NOW = new Date('2026-11-20T10:00:00Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('admin session token', () => {
  it('lasts 12 hours', () => {
    expect(ADMIN_SESSION_SECONDS).toBe(12 * 60 * 60);
  });

  it('round-trips and carries the owner id', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const session = await verifySessionToken(token, SECRET, at(60));
    expect(session).toEqual({ adminId: 'owner', expiresAt: at(ADMIN_SESSION_SECONDS) });
  });

  it('is valid until just before 12 hours and rejected after', async () => {
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, SECRET, at(ADMIN_SESSION_SECONDS - 1))).not.toBeNull();
    expect(await verifySessionToken(token, SECRET, at(ADMIN_SESSION_SECONDS + 1))).toBeNull();
  });

  it('is rejected when signed with another secret', async () => {
    const token = await createSessionToken('y'.repeat(48), NOW);
    expect(await verifySessionToken(token, SECRET, at(60))).toBeNull();
  });

  it('is rejected when the payload is tampered with', async () => {
    const token = await createSessionToken(SECRET, NOW);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ admin_id: 'owner', iat: 1, exp: 99999999999 }),
    ).toString('base64url');
    expect(await verifySessionToken(`${header}.${forged}.${signature}`, SECRET, at(60))).toBeNull();
  });

  it('is rejected when it is unsigned (alg none) or uses another algorithm', async () => {
    const none = [
      Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'),
      Buffer.from(
        JSON.stringify({ admin_id: 'owner', exp: Math.floor(at(3600).getTime() / 1000) }),
      ).toString('base64url'),
      '',
    ].join('.');
    expect(await verifySessionToken(none, SECRET, at(60))).toBeNull();

    const hs512 = await new SignJWT({ admin_id: 'owner' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(at(3600).getTime() / 1000))
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(hs512, SECRET, at(60))).toBeNull();
  });

  it('is rejected without an owner id', async () => {
    const token = await new SignJWT({ admin_id: 'someone-else' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(at(3600).getTime() / 1000))
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(token, SECRET, at(60))).toBeNull();
  });

  it.each([undefined, '', 'garbage', 'a.b.c'])('rejects a non-token (%s)', async (bad) => {
    expect(await verifySessionToken(bad, SECRET, at(60))).toBeNull();
  });

  it('refuses to work with a missing or short secret', async () => {
    await expect(createSessionToken('', NOW)).rejects.toThrow(/ADMIN_SESSION_SECRET/);
    await expect(createSessionToken('short', NOW)).rejects.toThrow(/ADMIN_SESSION_SECRET/);
    const token = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(token, 'short', at(60))).toBeNull();
    expect(await verifySessionToken(token, undefined, at(60))).toBeNull();
  });
});

describe('admin cookie', () => {
  it('is a session cookie (no Max-Age) that scripts cannot read', () => {
    const options = adminCookieOptions(true);
    expect(ADMIN_SESSION_COOKIE).toBe('admin_session');
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: true });
    expect(options).not.toHaveProperty('maxAge');
    expect(options).not.toHaveProperty('expires');
  });

  it('is not Secure only when told so (plain http in local development)', () => {
    expect(adminCookieOptions(false).secure).toBe(false);
  });
});
