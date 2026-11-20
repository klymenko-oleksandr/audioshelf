// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { attemptKey, clientIp } from './client-ip';

const headers = (init: Record<string, string>) => new Headers(init);

describe('clientIp', () => {
  it('prefers x-real-ip', () => {
    expect(clientIp(headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('uses the first address of x-forwarded-for', () => {
    expect(clientIp(headers({ 'x-forwarded-for': ' 198.51.100.4 , 10.0.0.1' }))).toBe(
      '198.51.100.4',
    );
  });

  it('falls back to "unknown" when there is no address', () => {
    expect(clientIp(headers({}))).toBe('unknown');
    expect(clientIp(headers({ 'x-forwarded-for': ' ' }))).toBe('unknown');
  });

  it('ignores absurdly long header values', () => {
    expect(clientIp(headers({ 'x-real-ip': 'a'.repeat(500) }))).toBe('unknown');
  });
});

describe('attemptKey', () => {
  const SECRET = 's'.repeat(48);

  it('is stable for one address and differs between addresses', () => {
    expect(attemptKey('203.0.113.7', SECRET)).toBe(attemptKey('203.0.113.7', SECRET));
    expect(attemptKey('203.0.113.7', SECRET)).not.toBe(attemptKey('203.0.113.8', SECRET));
  });

  it('never contains the address itself', () => {
    expect(attemptKey('203.0.113.7', SECRET)).not.toContain('203.0.113.7');
    expect(attemptKey('203.0.113.7', SECRET)).toMatch(/^ip:[0-9a-f]{32}$/);
  });

  it('depends on the secret', () => {
    expect(attemptKey('203.0.113.7', SECRET)).not.toBe(attemptKey('203.0.113.7', 'z'.repeat(48)));
  });
});
