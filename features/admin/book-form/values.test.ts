import { describe, expect, it } from 'vitest';
import { BIO_MAX, DESCRIPTION_MAX, NAME_MAX, NEW_CHOICE, TITLE_MAX, parseBookForm } from './values';

const ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const ok = (raw: Record<string, string>) => {
  const result = parseBookForm(raw);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.errors)}`);
  return result.value;
};
const errors = (raw: Record<string, string>) => {
  const result = parseBookForm(raw);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
};

describe('parseBookForm: a draft needs only a title', () => {
  it('accepts a title alone and fills every other field with its empty value', () => {
    expect(ok({ title: 'Сіддхартха' })).toEqual({
      title: 'Сіддхартха',
      description: null,
      language: 'uk',
      ongoing: false,
      author: { kind: 'none' },
      authorBio: null,
      narrator: { kind: 'none' },
      categoryId: null,
    });
  });

  it('trims the title and collapses inner whitespace', () => {
    expect(ok({ title: '  The   Hound \n of  the Baskervilles ' }).title).toBe(
      'The Hound of the Baskervilles',
    );
  });

  it.each([
    ['missing', {}],
    ['empty', { title: '' }],
    ['only spaces', { title: '   \n ' }],
  ])('rejects a title that is %s', (_name, raw) => {
    expect(errors(raw).title).toBe('Enter a title.');
  });

  it('allows a title of exactly the limit and rejects one character more', () => {
    expect(ok({ title: 'a'.repeat(TITLE_MAX) }).title).toHaveLength(TITLE_MAX);
    expect(errors({ title: 'a'.repeat(TITLE_MAX + 1) }).title).toBe(
      `Keep the title to ${TITLE_MAX} characters or fewer.`,
    );
  });
});

describe('parseBookForm: description, language, ongoing', () => {
  it('keeps line breaks, normalises CRLF, and turns blank into null', () => {
    expect(ok({ title: 'T', description: ' One\r\nTwo ' }).description).toBe('One\nTwo');
    expect(ok({ title: 'T', description: '  \n ' }).description).toBeNull();
  });

  it('limits the description to 1,000 characters, as on the board', () => {
    expect(DESCRIPTION_MAX).toBe(1000);
    expect(ok({ title: 'T', description: 'a'.repeat(DESCRIPTION_MAX) }).description).toHaveLength(
      DESCRIPTION_MAX,
    );
    expect(errors({ title: 'T', description: 'a'.repeat(DESCRIPTION_MAX + 1) }).description).toBe(
      'Keep the description to 1,000 characters or fewer.',
    );
  });

  it('accepts uk and en and rejects any other language', () => {
    expect(ok({ title: 'T', language: 'en' }).language).toBe('en');
    expect(ok({ title: 'T', language: 'uk' }).language).toBe('uk');
    expect(errors({ title: 'T', language: 'de' }).language).toBe('Pick a language.');
  });

  it('reads the ongoing checkbox: "on" is true, anything else false', () => {
    expect(ok({ title: 'T', ongoing: 'on' }).ongoing).toBe(true);
    expect(ok({ title: 'T', ongoing: 'true' }).ongoing).toBe(true);
    expect(ok({ title: 'T' }).ongoing).toBe(false);
    expect(ok({ title: 'T', ongoing: '' }).ongoing).toBe(false);
  });
});

describe('parseBookForm: author and narrator pickers', () => {
  it('picks an existing author and keeps the bio', () => {
    const value = ok({ title: 'T', author: ID, authorBio: '  Born in 1859.  ' });
    expect(value.author).toEqual({ kind: 'existing', id: ID });
    expect(value.authorBio).toBe('Born in 1859.');
  });

  it('creates a new author from a name, collapsing whitespace', () => {
    const value = ok({ title: 'T', author: NEW_CHOICE, newAuthorName: '  Arthur   Conan Doyle ' });
    expect(value.author).toEqual({ kind: 'new', name: 'Arthur Conan Doyle' });
  });

  it('asks for the name when "new author" is chosen without one', () => {
    expect(errors({ title: 'T', author: NEW_CHOICE, newAuthorName: ' ' }).newAuthorName).toBe(
      'Enter the author’s name.',
    );
  });

  it('rejects an author id that is not a UUID instead of sending it to the database', () => {
    expect(errors({ title: 'T', author: "x'; drop table books;--" }).author).toBe(
      'Pick an author from the list.',
    );
  });

  it('ignores a leftover new-author name and bio when no author is chosen', () => {
    const value = ok({ title: 'T', author: '', newAuthorName: 'Left over', authorBio: 'Ignored' });
    expect(value.author).toEqual({ kind: 'none' });
    expect(value.authorBio).toBeNull();
  });

  it('limits names and the bio', () => {
    expect(
      errors({ title: 'T', author: NEW_CHOICE, newAuthorName: 'a'.repeat(NAME_MAX + 1) })
        .newAuthorName,
    ).toBe(`Keep the name to ${NAME_MAX} characters or fewer.`);
    expect(errors({ title: 'T', author: ID, authorBio: 'a'.repeat(BIO_MAX + 1) }).authorBio).toBe(
      'Keep the bio to 2,000 characters or fewer.',
    );
  });

  it('handles the narrator the same way, without a bio', () => {
    expect(ok({ title: 'T', narrator: ID }).narrator).toEqual({ kind: 'existing', id: ID });
    expect(
      ok({ title: 'T', narrator: NEW_CHOICE, newNarratorName: 'David Clarke' }).narrator,
    ).toEqual({ kind: 'new', name: 'David Clarke' });
    expect(errors({ title: 'T', narrator: NEW_CHOICE }).newNarratorName).toBe(
      'Enter the narrator’s name.',
    );
    expect(errors({ title: 'T', narrator: 'nope' }).narrator).toBe(
      'Pick a narrator from the list.',
    );
  });
});

describe('parseBookForm: category', () => {
  it('takes a category id, or none', () => {
    expect(ok({ title: 'T', category: ID }).categoryId).toBe(ID);
    expect(ok({ title: 'T', category: '' }).categoryId).toBeNull();
  });

  it('rejects a category that is not a UUID', () => {
    expect(errors({ title: 'T', category: 'fiction' }).category).toBe(
      'Pick a category from the list.',
    );
  });
});

describe('parseBookForm: several mistakes at once', () => {
  it('reports every field, so one save shows all the problems', () => {
    const found = errors({
      title: '',
      language: 'xx',
      category: 'x',
      author: NEW_CHOICE,
      narrator: NEW_CHOICE,
    });
    expect(Object.keys(found).sort()).toEqual(
      ['category', 'language', 'newAuthorName', 'newNarratorName', 'title'].sort(),
    );
  });
});
