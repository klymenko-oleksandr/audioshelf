import { describe, expect, it } from 'vitest';
import { findPasskey, type Passkey, parsePasskeys, serializePasskey } from './passkeys';

const ONE: Passkey = {
  id: 'abc_DEF-1',
  publicKey: 'pQECAyYgASFYIA',
  transports: ['internal'],
  label: 'Laptop',
};

describe('parsePasskeys', () => {
  it('reads the list from the environment variable', () => {
    expect(parsePasskeys(JSON.stringify([ONE]))).toEqual([ONE]);
  });

  it('is an empty list when the variable is missing, empty or not JSON', () => {
    expect(parsePasskeys(undefined)).toEqual([]);
    expect(parsePasskeys('')).toEqual([]);
    expect(parsePasskeys('{not json')).toEqual([]);
    expect(parsePasskeys('{"id":"x"}')).toEqual([]);
  });

  it('skips entries that cannot be used, keeps the good ones', () => {
    const raw = JSON.stringify([
      ONE,
      { id: '', publicKey: 'x' },
      { id: 'no-key' },
      { id: 'bad chars!', publicKey: 'AAAA' },
      { id: 'ok2', publicKey: 'AAAA', transports: 'internal' },
      null,
    ]);
    expect(parsePasskeys(raw)).toEqual([ONE, { id: 'ok2', publicKey: 'AAAA' }]);
  });

  it('drops unknown transports and over-long labels', () => {
    const [entry] = parsePasskeys(
      JSON.stringify([
        { id: 'a', publicKey: 'AAAA', transports: ['usb', 'warp'], label: 'x'.repeat(200) },
      ]),
    );
    expect(entry?.transports).toEqual(['usb']);
    expect(entry?.label).toHaveLength(60);
  });
});

describe('findPasskey', () => {
  it('finds a passkey by credential id', () => {
    expect(findPasskey([ONE], 'abc_DEF-1')).toEqual(ONE);
    expect(findPasskey([ONE], 'other')).toBeUndefined();
  });
});

describe('serializePasskey', () => {
  it('prints one compact JSON object that parsePasskeys accepts back', () => {
    const text = serializePasskey(ONE);
    expect(text).not.toContain('\n');
    expect(parsePasskeys(`[${text}]`)).toEqual([ONE]);
  });
});
