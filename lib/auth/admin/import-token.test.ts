// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  bearerToken,
  isImportEnabled,
  isImportRequestAuthorised,
  isImportTokenValid,
} from './import-token';

const TOKEN = 'import-token-'.padEnd(40, 'x');

describe('import token: switched on', () => {
  it('is off unless the variable holds at least 32 characters', () => {
    expect(isImportEnabled(undefined)).toBe(false);
    expect(isImportEnabled('')).toBe(false);
    expect(isImportEnabled('short')).toBe(false);
    expect(isImportEnabled('x'.repeat(31))).toBe(false);
    expect(isImportEnabled('x'.repeat(32))).toBe(true);
  });
});

describe('bearerToken', () => {
  it('reads the token from an Authorization header', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('BEARER   abc')).toBe('abc');
  });

  it('refuses anything that is not a single Bearer token', () => {
    for (const header of [
      undefined,
      null,
      '',
      'abc',
      'Basic abc',
      'Bearer',
      'Bearer ',
      'Bearer a b',
      'Token abc',
    ]) {
      expect(bearerToken(header)).toBeUndefined();
    }
  });
});

describe('isImportTokenValid', () => {
  it('accepts only the exact token', () => {
    expect(isImportTokenValid(TOKEN, TOKEN)).toBe(true);
    expect(isImportTokenValid(TOKEN + 'y', TOKEN)).toBe(false);
    expect(isImportTokenValid(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(isImportTokenValid(TOKEN.replace('i', 'I'), TOKEN)).toBe(false);
    expect(isImportTokenValid('', TOKEN)).toBe(false);
  });

  it('never accepts anything while switched off, even a matching short value', () => {
    expect(isImportTokenValid('short', 'short')).toBe(false);
    expect(isImportTokenValid('', '')).toBe(false);
    expect(isImportTokenValid('', undefined)).toBe(false);
    expect(isImportTokenValid(undefined, undefined)).toBe(false);
    expect(isImportTokenValid(undefined, TOKEN)).toBe(false);
  });

  it('compares multi-byte tokens by their bytes, not their length in characters', () => {
    const configured = 'ж'.repeat(32);
    expect(isImportTokenValid(configured, configured)).toBe(true);
    expect(isImportTokenValid('ї'.repeat(32), configured)).toBe(false);
  });
});

describe('isImportRequestAuthorised', () => {
  const headers = (value?: string) => new Headers(value ? { authorization: value } : {});

  it('needs a Bearer header carrying the token', () => {
    expect(isImportRequestAuthorised(headers(`Bearer ${TOKEN}`), TOKEN)).toBe(true);
    expect(isImportRequestAuthorised(headers(`Bearer nope${TOKEN}`), TOKEN)).toBe(false);
    expect(isImportRequestAuthorised(headers(TOKEN), TOKEN)).toBe(false);
    expect(isImportRequestAuthorised(headers(), TOKEN)).toBe(false);
  });

  it('ignores a session cookie: the cookie alone never opens the import', () => {
    const withCookie = new Headers({ cookie: 'admin_session=anything' });
    expect(isImportRequestAuthorised(withCookie, TOKEN)).toBe(false);
  });

  it('is closed when the token is not configured', () => {
    expect(isImportRequestAuthorised(headers(`Bearer ${TOKEN}`), undefined)).toBe(false);
    expect(isImportRequestAuthorised(headers('Bearer short'), 'short')).toBe(false);
  });
});
