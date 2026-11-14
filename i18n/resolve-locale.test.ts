import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, resolveLocale } from './resolve-locale';

describe('resolveLocale', () => {
  it('prefers a valid cookie over the browser language', () => {
    expect(resolveLocale('en', 'uk-UA,uk;q=0.9')).toBe('en');
    expect(resolveLocale('uk', 'en-US,en;q=0.9')).toBe('uk');
  });

  it('ignores an unknown cookie value and falls back to the browser', () => {
    expect(resolveLocale('de', 'en-GB,en;q=0.8')).toBe('en');
  });

  it('falls back to Ukrainian when nothing matches', () => {
    expect(resolveLocale(undefined, 'de-DE,fr;q=0.8')).toBe('uk');
    expect(resolveLocale(undefined, undefined)).toBe('uk');
    expect(resolveLocale(null, '')).toBe('uk');
  });
});

describe('localeFromAcceptLanguage', () => {
  it('strips region subtags', () => {
    expect(localeFromAcceptLanguage('uk-UA')).toBe('uk');
    expect(localeFromAcceptLanguage('en-US')).toBe('en');
  });

  it('honours q-weights over header order', () => {
    expect(localeFromAcceptLanguage('en;q=0.5,uk;q=0.9')).toBe('uk');
    expect(localeFromAcceptLanguage('de,en;q=0.9,uk;q=0.8')).toBe('en');
  });

  it('skips entries with q=0 and malformed weights', () => {
    expect(localeFromAcceptLanguage('en;q=0,uk;q=0.1')).toBe('uk');
    expect(localeFromAcceptLanguage('en;q=abc,uk;q=0.1')).toBe('uk');
  });

  it('returns undefined when no supported language is listed', () => {
    expect(localeFromAcceptLanguage('de,fr')).toBeUndefined();
    expect(localeFromAcceptLanguage('*')).toBeUndefined();
  });
});
