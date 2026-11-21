/**
 * The add/edit book form: what it submits, and the rules every save is checked against.
 * Pure on purpose (no database, no React), so the rules are covered by plain unit tests and
 * run in the server action; the form shows the same messages next to each field.
 *
 * A draft needs only a title (PRD: "Save as draft at any time"). Author, narrator and category
 * stay optional; the publish rules that require author, category and a track come in 4d.
 */

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;
export const NAME_MAX = 120;
export const BIO_MAX = 2000;

export const LANGUAGES = ['uk', 'en'] as const;
export type BookLanguage = (typeof LANGUAGES)[number];
export const LANGUAGE_LABELS: Record<BookLanguage, string> = { uk: 'Українська', en: 'English' };

/** The value of the author / narrator picker that means "create a new one". */
export const NEW_CHOICE = 'new';

export type FieldName =
  | 'title'
  | 'author'
  | 'newAuthorName'
  | 'authorBio'
  | 'narrator'
  | 'newNarratorName'
  | 'category'
  | 'language'
  | 'description';
export type FieldErrors = Partial<Record<FieldName, string>>;

export type PersonChoice =
  { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string };

export interface BookFormInput {
  title: string;
  description: string | null;
  language: BookLanguage;
  ongoing: boolean;
  author: PersonChoice;
  /** Bio of the chosen or new author; null clears it. Ignored when there is no author. */
  authorBio: string | null;
  narrator: PersonChoice;
  categoryId: string | null;
}

export type ParseResult = { ok: true; value: BookFormInput } | { ok: false; errors: FieldErrors };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

const limit = (n: number) => n.toLocaleString('en-US');
const oneLine = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const multiLine = (value: string | undefined) => (value ?? '').replace(/\r\n?/g, '\n').trim();

function parsePerson(
  raw: string | undefined,
  newName: string | undefined,
  who: 'author' | 'narrator',
  errors: FieldErrors,
): PersonChoice {
  const choice = (raw ?? '').trim();
  if (choice === '') return { kind: 'none' };

  if (choice === NEW_CHOICE) {
    const key = who === 'author' ? 'newAuthorName' : 'newNarratorName';
    const name = oneLine(newName);
    if (!name) errors[key] = `Enter the ${who}’s name.`;
    else if (name.length > NAME_MAX) {
      errors[key] = `Keep the name to ${limit(NAME_MAX)} characters or fewer.`;
    } else return { kind: 'new', name };
    return { kind: 'none' };
  }

  if (isUuid(choice)) return { kind: 'existing', id: choice.toLowerCase() };
  errors[who] = `Pick ${who === 'author' ? 'an author' : 'a narrator'} from the list.`;
  return { kind: 'none' };
}

export function parseBookForm(raw: Record<string, string | undefined>): ParseResult {
  const errors: FieldErrors = {};

  const title = oneLine(raw.title);
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > TITLE_MAX) {
    errors.title = `Keep the title to ${limit(TITLE_MAX)} characters or fewer.`;
  }

  const description = multiLine(raw.description);
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Keep the description to ${limit(DESCRIPTION_MAX)} characters or fewer.`;
  }

  const languageRaw = (raw.language ?? 'uk').trim() || 'uk';
  const language = (LANGUAGES as readonly string[]).includes(languageRaw)
    ? (languageRaw as BookLanguage)
    : null;
  if (!language) errors.language = 'Pick a language.';

  const author = parsePerson(raw.author, raw.newAuthorName, 'author', errors);
  const narrator = parsePerson(raw.narrator, raw.newNarratorName, 'narrator', errors);

  let authorBio: string | null = null;
  if (author.kind !== 'none') {
    const bio = multiLine(raw.authorBio);
    if (bio.length > BIO_MAX) {
      errors.authorBio = `Keep the bio to ${limit(BIO_MAX)} characters or fewer.`;
    } else authorBio = bio || null;
  }

  const categoryRaw = (raw.category ?? '').trim();
  let categoryId: string | null = null;
  if (categoryRaw !== '') {
    if (isUuid(categoryRaw)) categoryId = categoryRaw.toLowerCase();
    else errors.category = 'Pick a category from the list.';
  }

  if (Object.keys(errors).length > 0 || !language) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      description: description || null,
      language,
      ongoing: raw.ongoing === 'on' || raw.ongoing === 'true',
      author,
      authorBio,
      narrator,
      categoryId,
    },
  };
}
