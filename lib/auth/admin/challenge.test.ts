// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createChallengeToken, verifyChallengeToken, CHALLENGE_SECONDS } from './challenge';
import { createSessionToken, verifySessionToken } from './session';

const SECRET = 'a-secret-that-is-at-least-32-characters-long';
const NOW = new Date('2026-11-21T20:00:00Z');

describe('challenge token', () => {
  it('carries the challenge for the same purpose', async () => {
    const token = await createChallengeToken(SECRET, 'login', 'chal-1', NOW);
    expect(await verifyChallengeToken(token, SECRET, 'login', NOW)).toBe('chal-1');
  });

  it('is refused for another purpose, so a login challenge cannot finish a setup', async () => {
    const token = await createChallengeToken(SECRET, 'login', 'chal-1', NOW);
    expect(await verifyChallengeToken(token, SECRET, 'setup', NOW)).toBeNull();
  });

  it('expires after a few minutes', async () => {
    const token = await createChallengeToken(SECRET, 'login', 'chal-1', NOW);
    const later = new Date(NOW.getTime() + (CHALLENGE_SECONDS + 1) * 1000);
    expect(await verifyChallengeToken(token, SECRET, 'login', later)).toBeNull();
  });

  it('is refused with the wrong secret or when tampered with', async () => {
    const token = await createChallengeToken(SECRET, 'login', 'chal-1', NOW);
    expect(await verifyChallengeToken(token, SECRET + 'x', 'login', NOW)).toBeNull();
    expect(await verifyChallengeToken(token.slice(0, -2) + 'AA', SECRET, 'login', NOW)).toBeNull();
    expect(await verifyChallengeToken(undefined, SECRET, 'login', NOW)).toBeNull();
    expect(await verifyChallengeToken(token, undefined, 'login', NOW)).toBeNull();
  });

  it('is not a session, and a session is not a challenge', async () => {
    const challenge = await createChallengeToken(SECRET, 'login', 'chal-1', NOW);
    expect(await verifySessionToken(challenge, SECRET, NOW)).toBeNull();
    const session = await createSessionToken(SECRET, NOW);
    expect(await verifyChallengeToken(session, SECRET, 'login', NOW)).toBeNull();
  });
});
