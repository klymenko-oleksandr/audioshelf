import type { CategoryRef } from './data/queries';

/** A category's name in the UI language; English falls back to Ukrainian (the required one). */
export function categoryName(category: Pick<CategoryRef, 'nameUk' | 'nameEn'>, locale: string) {
  return locale === 'en' ? (category.nameEn ?? category.nameUk) : category.nameUk;
}

/** Display name for a book's language badge; unknown codes show as the code itself. */
export const BOOK_LANGUAGES = ['uk', 'en'] as const;
export type BookLanguage = (typeof BOOK_LANGUAGES)[number];
export const isBookLanguage = (code: string): code is BookLanguage =>
  (BOOK_LANGUAGES as readonly string[]).includes(code);

/** Two letters for a person's avatar: first and last word of the name ("Леся Українка" → "ЛУ"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => [...word][0]!.toLocaleUpperCase()).join('');
}
