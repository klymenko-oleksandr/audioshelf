import { describe, expect, it } from 'vitest';
import { isSlug, slugify, transliterate } from './slug';

describe('transliterate (Ukrainian, official 2010 romanisation)', () => {
  it.each([
    ['Сіддхартха', 'siddkhartkha'],
    ['Колгосп тварин', 'kolhosp tvaryn'],
    ['Пригоди барона Мюнхаузена', 'pryhody barona miunkhauzena'],
    ['Братство персня', 'bratstvo persnia'],
    ['Леся Українка', 'lesia ukrainka'],
    ['Згурський', 'zghurskyi'],
    ['Єнакієве', 'yenakiieve'],
    ['Їжак і Юрій', 'yizhak i yurii'],
    ['Яготин', 'yahotyn'],
    ["Розп'яття", 'rozpiattia'],
    ['Ґалаґан', 'galagan'],
    ['Щастя', 'shchastia'],
  ])('%s → %s', (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });

  it('strips diacritics from Latin letters and leaves plain Latin alone', () => {
    expect(transliterate('Émile Zola')).toBe('emile zola');
    expect(transliterate('Tolkien')).toBe('tolkien');
  });
});

describe('slugify', () => {
  it('makes hyphenated ASCII slugs', () => {
    expect(slugify('Герман Гессе — Сіддхартха')).toBe('herman-hesse-siddkhartkha');
    expect(slugify('Розділ 9. Під вивіскою «Брикливий поні»')).toBe(
      'rozdil-9-pid-vyviskoiu-bryklyvyi-poni',
    );
    expect(slugify('  The Lord of the Rings!!  ')).toBe('the-lord-of-the-rings');
  });

  it('cuts long text at a word boundary', () => {
    const slug = slugify('Розділ 8. Туман понад Курганними Пагорбами і ще трохи слів', 30);
    expect(slug).toBe('rozdil-8-tuman-ponad');
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it('hard-cuts a single very long word', () => {
    expect(slugify('a'.repeat(100), 20)).toBe('a'.repeat(20));
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('«…»')).toBe('');
    expect(slugify('日本語')).toBe('');
  });

  it('always produces a valid slug or nothing', () => {
    for (const text of ['01', 'Ом', 'A-B--C', '№ 5', 'x'.repeat(200)]) {
      const slug = slugify(text);
      expect(slug === '' || isSlug(slug)).toBe(true);
    }
  });
});

describe('isSlug', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(isSlug('hesse-siddhartha')).toBe(true);
    expect(isSlug('1984')).toBe(true);
  });

  it('rejects anything that could surprise a URL or a storage path', () => {
    for (const bad of ['', 'Hesse', 'a--b', '-a', 'a-', 'a/b', '../x', 'a b', 'сон']) {
      expect(isSlug(bad)).toBe(false);
    }
  });
});
