export const locales = ['uk', 'en'] as const;
export type Locale = (typeof locales)[number];

/** Used when neither the cookie nor the browser asks for a language we have. */
export const defaultLocale: Locale = 'uk';

/** No locale in the URL (ADR 6): the choice lives in this cookie. */
export const LOCALE_COOKIE = 'locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
