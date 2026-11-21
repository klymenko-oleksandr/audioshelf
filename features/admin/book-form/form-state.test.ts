import { describe, expect, it } from 'vitest';
import type { BookEditData, BookFormOptions } from '../data/book-form';
import { chooseAuthor, emptyValues, sameRaw, toRaw, valuesFromBook } from './form-state';
import { NEW_CHOICE, parseBookForm } from './values';

const AUTHOR = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const options: BookFormOptions = {
  authors: [
    { id: AUTHOR, name: 'Леся Українка', bio: 'Poet.' },
    { id: '4f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b', name: 'Іван Франко', bio: '' },
  ],
  narrators: [],
  categories: [],
};
const book: BookEditData = {
  id: 'b',
  slug: 'lisova-pisnia',
  title: 'Лісова пісня',
  description: null,
  language: 'uk',
  ongoing: true,
  status: 'draft',
  authorId: AUTHOR,
  narratorId: null,
  categoryId: null,
  publishedAt: null,
  updatedAt: new Date(),
};

describe('form state', () => {
  it('starts a new book empty, in Ukrainian', () => {
    expect(emptyValues()).toMatchObject({ title: '', language: 'uk', author: '', ongoing: false });
  });

  it('fills the form from a book, with the bio of its author', () => {
    expect(valuesFromBook(book, options)).toMatchObject({
      title: 'Лісова пісня',
      description: '',
      ongoing: true,
      author: AUTHOR,
      authorBio: 'Poet.',
      narrator: '',
      category: '',
    });
  });

  it('what the form submits is accepted by the parser', () => {
    const raw = toRaw(valuesFromBook(book, options));
    expect(parseBookForm(raw)).toMatchObject({ ok: true, value: { ongoing: true } });
  });

  it('submits only the parts that matter: no new-author name or bio when no such author', () => {
    const values = {
      ...emptyValues(),
      title: 'T',
      newAuthorName: 'Left over',
      authorBio: 'Left over',
    };
    const raw = toRaw(values);
    expect(raw.newAuthorName).toBe('');
    expect(raw.authorBio).toBe('');
    expect(raw.ongoing).toBe('');
  });

  it('choosing an author fills in their bio; choosing "new" or none clears it', () => {
    const start = valuesFromBook({ ...book, authorId: null }, options);
    expect(chooseAuthor(start, AUTHOR, options)).toMatchObject({
      author: AUTHOR,
      authorBio: 'Poet.',
    });
    expect(chooseAuthor(start, NEW_CHOICE, options)).toMatchObject({
      author: NEW_CHOICE,
      authorBio: '',
    });
    expect(chooseAuthor({ ...start, authorBio: 'x' }, '', options)).toMatchObject({
      author: '',
      authorBio: '',
    });
  });

  it('compares what is submitted with what was saved', () => {
    const saved = toRaw(valuesFromBook(book, options));
    expect(sameRaw(saved, toRaw(valuesFromBook(book, options)))).toBe(true);
    expect(sameRaw(saved, { ...saved, title: 'Other' })).toBe(false);
  });
});
