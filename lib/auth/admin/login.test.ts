// @vitest-environment node
import { randomBytes, scryptSync } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminLoginAttempts } from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { attemptLogin, type LoginEnv } from './login';
import { verifySessionToken } from './session';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const PASSWORD = 'correct horse battery';
const SECRET = 'k'.repeat(48);
const NOW = new Date('2026-11-20T10:00:00Z');
const MIN = 60_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);

function makeHash(password: string) {
  const salt = randomBytes(16);
  return `scrypt.${salt.toString('base64url')}.${scryptSync(password, salt, 64).toString('base64url')}`;
}
const env: LoginEnv = { passwordHash: makeHash(PASSWORD), sessionSecret: SECRET };
const from = (ip: string) => new Headers({ 'x-forwarded-for': ip });

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.delete(adminLoginAttempts);
});

const login = (password: string, ip = '203.0.113.7', now = NOW, e: LoginEnv = env) =>
  attemptLogin({ db: t.db, headers: from(ip), password, env: e, now });

describe('attemptLogin', () => {
  it('signs in with the right password and returns a 12 h session token', async () => {
    const result = await login(PASSWORD);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(await verifySessionToken(result.token, SECRET, at(MIN))).toMatchObject({
      adminId: 'owner',
    });
  });

  it('says how many attempts are left after a wrong password', async () => {
    expect(await login('nope-nope-nope')).toEqual({ status: 'wrong', attemptsLeft: 4 });
    expect(await login('nope-nope-nope')).toEqual({ status: 'wrong', attemptsLeft: 3 });
  });

  it('says the password is too short, without counting an attempt', async () => {
    for (let i = 0; i < 7; i += 1) {
      expect(await login('short')).toEqual({ status: 'too_short' });
    }
    // Still five tries left for real guesses, and the right password still works.
    expect(await login('nope-nope-nope')).toEqual({ status: 'wrong', attemptsLeft: 4 });
    expect((await login(PASSWORD)).status).toBe('ok');
  });

  it('counts length after NFKC normalisation, like the password check', async () => {
    // Seven full-width letters normalise to seven characters: still too short.
    expect(await login('ａｂｃｄｅｆｇ')).toEqual({ status: 'too_short' });
  });

  it('answers a locked address with the lock, not the length hint, for a long wrong password', async () => {
    for (let i = 0; i < 5; i += 1) await login('nope-nope-nope', '203.0.113.7', at(i * 1000));
    expect(await login('nope-nope-nope', '203.0.113.7', at(9000))).toMatchObject({
      status: 'locked',
    });
  });

  it('locks the address after five wrong passwords, with the time to wait', async () => {
    for (let i = 0; i < 4; i += 1) await login('nope-nope-nope', '203.0.113.7', at(i * 1000));
    const fifth = await login('nope-nope-nope', '203.0.113.7', at(4000));
    expect(fifth).toEqual({ status: 'locked', retryAfterSeconds: 15 * 60 });
    const sixth = await login('nope-nope-nope', '203.0.113.7', at(60_000));
    expect(sixth).toMatchObject({ status: 'locked' });
  });

  it('does not even check the password while locked: the right one is refused too', async () => {
    for (let i = 0; i < 5; i += 1) await login('nope-nope-nope', '203.0.113.7', at(i * 1000));
    expect(await login(PASSWORD, '203.0.113.7', at(10 * 1000))).toMatchObject({ status: 'locked' });
  });

  it("someone else's wrong guesses never lock the owner out", async () => {
    for (let i = 0; i < 20; i += 1) await login('nope-nope-nope', '198.51.100.99', at(i * 1000));
    expect((await login(PASSWORD, '203.0.113.7', at(30 * 1000))).status).toBe('ok');
  });

  it('works again after the lock expires, and a success resets the count', async () => {
    for (let i = 0; i < 5; i += 1) await login('nope-nope-nope', '203.0.113.7', at(i * 1000));
    expect((await login(PASSWORD, '203.0.113.7', at(16 * MIN))).status).toBe('ok');
    expect(await login('nope-nope-nope', '203.0.113.7', at(17 * MIN))).toEqual({
      status: 'wrong',
      attemptsLeft: 4,
    });
  });

  it('a correct fifth attempt still signs in', async () => {
    for (let i = 0; i < 4; i += 1) await login('nope-nope-nope', '203.0.113.7', at(i * 1000));
    expect((await login(PASSWORD, '203.0.113.7', at(5000))).status).toBe('ok');
  });

  it('rejects an empty password as too short', async () => {
    expect(await login('')).toEqual({ status: 'too_short' });
  });

  it.each([
    ['no hash', { passwordHash: undefined, sessionSecret: SECRET }],
    ['no secret', { passwordHash: env.passwordHash, sessionSecret: undefined }],
    ['short secret', { passwordHash: env.passwordHash, sessionSecret: 'short' }],
    ['malformed hash', { passwordHash: 'nonsense', sessionSecret: SECRET }],
  ])('refuses to sign anyone in when the server is misconfigured (%s)', async (_n, bad) => {
    expect(await login(PASSWORD, '203.0.113.7', NOW, bad as LoginEnv)).toEqual({
      status: 'misconfigured',
    });
  });

  it('does not sign in when the hash is the hash of an empty password', async () => {
    const emptyHash = { passwordHash: makeHash(''), sessionSecret: SECRET };
    expect((await login('', '203.0.113.7', NOW, emptyHash)).status).toBe('too_short');
  });
});
