import type { BookEditData, BookFormOptions } from '../data/book-form';
import { NEW_CHOICE, type BookLanguage } from './values';

/** What the add/edit form holds while the admin types. */
export interface FormValues {
  title: string;
  description: string;
  language: BookLanguage;
  ongoing: boolean;
  /** '' (none), an author id, or NEW_CHOICE. */
  author: string;
  newAuthorName: string;
  authorBio: string;
  narrator: string;
  newNarratorName: string;
  category: string;
}

/** The strings the form posts to the server action, and the parser reads. */
export type RawForm = Record<string, string>;

export function emptyValues(): FormValues {
  return {
    title: '',
    description: '',
    language: 'uk',
    ongoing: false,
    author: '',
    newAuthorName: '',
    authorBio: '',
    narrator: '',
    newNarratorName: '',
    category: '',
  };
}

export function valuesFromBook(book: BookEditData, options: BookFormOptions): FormValues {
  const author = options.authors.find((a) => a.id === book.authorId);
  return {
    ...emptyValues(),
    title: book.title,
    description: book.description ?? '',
    language: book.language,
    ongoing: book.ongoing,
    author: book.authorId ?? '',
    authorBio: author?.bio ?? '',
    narrator: book.narratorId ?? '',
    category: book.categoryId ?? '',
  };
}

/** Choosing an author shows that author's bio so it can be read and edited. */
export function chooseAuthor(
  values: FormValues,
  choice: string,
  options: BookFormOptions,
): FormValues {
  const bio = options.authors.find((a) => a.id === choice)?.bio ?? '';
  return { ...values, author: choice, newAuthorName: '', authorBio: bio };
}

/** Leftovers of a choice the admin moved away from are not submitted, so they never count as changes. */
export function toRaw(values: FormValues): RawForm {
  return {
    title: values.title,
    description: values.description,
    language: values.language,
    ongoing: values.ongoing ? 'on' : '',
    author: values.author,
    newAuthorName: values.author === NEW_CHOICE ? values.newAuthorName : '',
    authorBio: values.author === '' ? '' : values.authorBio,
    narrator: values.narrator,
    newNarratorName: values.narrator === NEW_CHOICE ? values.newNarratorName : '',
    category: values.category,
  };
}

export function sameRaw(a: RawForm, b: RawForm): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? '') === (b[key] ?? ''));
}
