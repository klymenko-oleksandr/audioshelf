// @vitest-environment node
import { randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isLongEnough, MIN_PASSWORD_LENGTH, verifyPassword } from './password';

/** Same recipe as the one-line command given to the owner (see .env.example). */
function makeHash(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, 64);
  return `scrypt.${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

describe('verifyPassword', () => {
  const stored = makeHash('correct horse battery');

  it('accepts the password the hash was made from', async () => {
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
    expect(await verifyPassword('Correct horse battery', stored)).toBe(false);
  });

  it('treats Unicode that looks the same as the same password (NFKC)', async () => {
    const hash = makeHash('pässwörd-12345');
    // "ä" typed as "a" + combining diaeresis is the same text for the user.
    expect(await verifyPassword('pässwörd-12345', hash)).toBe(true);
  });

  it('never accepts the hash itself as the password', async () => {
    expect(await verifyPassword(stored, stored)).toBe(false);
  });

  it('rejects an empty password even when the hash was made from an empty password', async () => {
    expect(await verifyPassword('', makeHash(''))).toBe(false);
  });

  it('rejects a password shorter than the minimum even when the hash matches it', async () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(await verifyPassword(short, makeHash(short))).toBe(false);
    const ok = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(await verifyPassword(ok, makeHash(ok))).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['no separators', 'scrypt'],
    ['wrong scheme', 'bcrypt.abc.def'],
    ['missing hash', 'scrypt.abc.'],
    ['extra part', 'scrypt.abc.def.ghi'],
    ['not base64url', 'scrypt.@@@.###'],
    ['wrong hash length', 'scrypt.AAAAAAAAAAAAAAAAAAAAAA.AAAA'],
  ])('rejects a malformed stored hash (%s) instead of throwing', async (_name, bad) => {
    expect(await verifyPassword('correct horse battery', bad)).toBe(false);
  });

  it('rejects an absurdly long password without hashing it', async () => {
    expect(await verifyPassword('a'.repeat(10_000), stored)).toBe(false);
  });
});

describe('isLongEnough', () => {
  it('needs the minimum length after NFKC normalisation', () => {
    expect(isLongEnough('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true);
    expect(isLongEnough('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false);
    expect(isLongEnough('')).toBe(false);
    expect(isLongEnough('ａｂｃｄｅｆｇ')).toBe(false);
  });
});
