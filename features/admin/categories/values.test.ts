import { describe, expect, it } from 'vitest';
import { NAME_MAX, categoryDeleteBlock, parseCategoryForm } from './values';

describe('parseCategoryForm', () => {
  it('needs a Ukrainian name', () => {
    expect(parseCategoryForm({ nameUk: '', nameEn: 'Fiction' })).toEqual({
      ok: false,
      errors: { nameUk: 'Enter the name in Ukrainian.' },
    });
    expect(parseCategoryForm({ nameUk: '   ' }).ok).toBe(false);
  });

  it('keeps the English name optional and turns an empty one into null', () => {
    expect(parseCategoryForm({ nameUk: 'Художня' })).toEqual({
      ok: true,
      value: { nameUk: 'Художня', nameEn: null },
    });
    expect(parseCategoryForm({ nameUk: 'Художня', nameEn: '  ' })).toEqual({
      ok: true,
      value: { nameUk: 'Художня', nameEn: null },
    });
  });

  it('trims and collapses spacing', () => {
    expect(
      parseCategoryForm({ nameUk: '  Науково   популярна ', nameEn: ' Non  fiction ' }),
    ).toEqual({
      ok: true,
      value: { nameUk: 'Науково популярна', nameEn: 'Non fiction' },
    });
  });

  it('refuses names that are too long, saying which field', () => {
    const long = 'а'.repeat(NAME_MAX + 1);
    const result = parseCategoryForm({ nameUk: long, nameEn: 'b'.repeat(NAME_MAX + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['nameEn', 'nameUk']);
    }
  });

  it('accepts a name of exactly the maximum length', () => {
    expect(parseCategoryForm({ nameUk: 'а'.repeat(NAME_MAX) }).ok).toBe(true);
  });
});

describe('categoryDeleteBlock', () => {
  it('lets an unused category go', () => {
    expect(categoryDeleteBlock({ liveBooks: 0, deletedBooks: 0 })).toBeNull();
  });

  it('blocks a category with books and counts them', () => {
    expect(categoryDeleteBlock({ liveBooks: 1, deletedBooks: 0 })).toBe(
      'Used by 1 book. Move it to another category first.',
    );
    expect(categoryDeleteBlock({ liveBooks: 48, deletedBooks: 0 })).toBe(
      'Used by 48 books. Move them to another category first.',
    );
  });

  it('counts deleted books too, because they can come back', () => {
    expect(categoryDeleteBlock({ liveBooks: 0, deletedBooks: 2 })).toBe(
      'Used by 2 deleted books that can still be restored.',
    );
    expect(categoryDeleteBlock({ liveBooks: 3, deletedBooks: 1 })).toBe(
      'Used by 3 books and 1 deleted book. Move them to another category first.',
    );
  });
});
