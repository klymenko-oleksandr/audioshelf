import { describe, expect, it } from 'vitest';
import { categoryName, initials } from './names';

describe('categoryName', () => {
  it('uses the name for the interface language, falling back to Ukrainian', () => {
    expect(categoryName({ nameUk: 'Поезія', nameEn: 'Poetry' }, 'en')).toBe('Poetry');
    expect(categoryName({ nameUk: 'Поезія', nameEn: 'Poetry' }, 'uk')).toBe('Поезія');
    expect(categoryName({ nameUk: 'Поезія', nameEn: null }, 'en')).toBe('Поезія');
  });
});

describe('initials', () => {
  it('takes the first letters of the first and last word', () => {
    expect(initials('Леся Українка')).toBe('ЛУ');
    expect(initials('Arthur Conan Doyle')).toBe('AD');
    expect(initials('  джон   толкін ')).toBe('ДТ');
  });

  it('copes with a single word and an empty name', () => {
    expect(initials('Гомер')).toBe('Г');
    expect(initials('')).toBe('');
  });
});
