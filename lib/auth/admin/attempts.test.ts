// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminLoginAttempts } from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { clearAttempts, purgeOldAttempts, reserveLoginAttempt } from './attempts';
import { LOCK_MS } from './lockout';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;

const NOW = new Date('2026-11-20T10:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.delete(adminLoginAttempts);
});

const rowFor = async (key: string) =>
  (await t.db.select().from(adminLoginAttempts).where(eq(adminLoginAttempts.key, key)))[0];

describe('reserveLoginAttempt', () => {
  it('counts attempts per key and locks after the fifth', async () => {
    const left: Array<number | null> = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await reserveLoginAttempt(t.db, 'ip:a', at(i * 1000));
      left.push(r.allowed ? r.attemptsLeft : null);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    const sixth = await reserveLoginAttempt(t.db, 'ip:a', at(6000));
    expect(sixth).toMatchObject({ allowed: false });
    expect((await rowFor('ip:a'))?.lockedUntil).toEqual(at(4000 + LOCK_MS));
  });

  it('keeps addresses apart: one locked address does not lock another', async () => {
    for (let i = 0; i < 6; i += 1) await reserveLoginAttempt(t.db, 'ip:attacker', at(i * 1000));
    expect(await reserveLoginAttempt(t.db, 'ip:attacker', at(7000))).toMatchObject({
      allowed: false,
    });
    expect(await reserveLoginAttempt(t.db, 'ip:owner', at(7000))).toMatchObject({
      allowed: true,
      attemptsLeft: 4,
    });
  });

  it('lets only five of many simultaneous attempts through', async () => {
    // A burst of 20 parallel guesses must not all get checked against the password.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveLoginAttempt(t.db, 'ip:burst', NOW)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(15);
  });

  it('allows attempts again after the lock expires', async () => {
    for (let i = 0; i < 5; i += 1) await reserveLoginAttempt(t.db, 'ip:a', NOW);
    expect(await reserveLoginAttempt(t.db, 'ip:a', at(LOCK_MS + 1))).toMatchObject({
      allowed: true,
      attemptsLeft: 4,
    });
  });
});

describe('clearAttempts', () => {
  it('forgets the address after a correct password', async () => {
    await reserveLoginAttempt(t.db, 'ip:a', NOW);
    await reserveLoginAttempt(t.db, 'ip:a', at(1000));
    await clearAttempts(t.db, 'ip:a');
    expect(await rowFor('ip:a')).toBeUndefined();
    expect(await reserveLoginAttempt(t.db, 'ip:a', at(2000))).toMatchObject({ attemptsLeft: 4 });
  });

  it('is a no-op for an address with no row', async () => {
    await expect(clearAttempts(t.db, 'ip:nobody')).resolves.toBeUndefined();
  });
});

describe('purgeOldAttempts', () => {
  it('drops rows idle for more than a day and keeps recent or locked ones', async () => {
    await reserveLoginAttempt(t.db, 'ip:old', at(-2 * 24 * 60 * MIN));
    await reserveLoginAttempt(t.db, 'ip:recent', at(-60 * MIN));
    for (let i = 0; i < 5; i += 1) await reserveLoginAttempt(t.db, 'ip:locked', NOW);
    await purgeOldAttempts(t.db, NOW);
    expect(await rowFor('ip:old')).toBeUndefined();
    expect(await rowFor('ip:recent')).toBeDefined();
    expect(await rowFor('ip:locked')).toBeDefined();
  });
});
