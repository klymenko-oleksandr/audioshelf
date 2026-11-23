/**
 * `book.json`: what the content pipeline sends to describe a book (Phase 4e, content track C3).
 * Pure on purpose (no database, no storage), so every rule is covered by plain unit tests.
 *
 *   {
 *     "slug": "hesse-siddhartha",          // required; the book's identity, Latin, see lib/slug.ts
 *     "title": "Сіддхартха",               // required
 *     "author": "Герман Гессе",            // optional; matched to an existing author by name
 *     "narrator": "…",                     // optional ("Read by")
 *     "category": "fiction",               // optional; the slug of an existing category
 *     "description": "…",                  // optional
 *     "language": "uk",                    // "uk" (default) or "en"
 *     "ongoing": false,                    // default false
 *     "cover": "cover.jpg",                // accepted and ignored (cover upload is parked)
 *     "parts": [ { "number": 1, "title": "…", "file": "01.mp3", "size": 31457280,
 *                  "sha256": "<64 hex>", "durationSeconds": 3600.4 } ]
 *   }
 *
 * The limits are the add/edit form's (`book-form/values.ts`) and the uploader's
 * (`tracks/file-check.ts`), so the API and the admin screens cannot drift apart. Object keys are
 * never part of the document: the server builds them from the slug, number and hash (ADR 1).
 */
import { isSlug } from '@/lib/slug';
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  TITLE_MAX,
  LANGUAGES,
  type BookLanguage,
} from '../book-form/values';
import { checkAudioFile } from '../tracks/file-check';

export const MAX_BOOK_PARTS = 500;
export const SLUG_MAX = 60;
const FILE_NAME_MAX = 255;
const DURATION_MAX_SECONDS = 1_000_000; // a bit over 277 hours
const MAX_ISSUES = 50;

export interface ImportPart {
  /** 1, 2, 3… in play order. */
  number: number;
  title: string;
  /** Original file name, kept for the admin's track list. */
  file: string;
  size: number;
  /** Lower-case hex SHA-256 of the file; its first 8 characters go in the object key. */
  sha256: string;
  durationSeconds: number;
}

export interface ImportBook {
  slug: string;
  title: string;
  author: string | null;
  narrator: string | null;
  /** Slug of an existing category. */
  category: string | null;
  description: string | null;
  language: BookLanguage;
  ongoing: boolean;
  parts: ImportPart[];
}

export interface ImportIssue {
  /** Where the problem is, like `parts[2].size`; empty for the document as a whole. */
  path: string;
  message: string;
}

export type ParsedBook =
  { ok: true; value: ImportBook; warnings: string[] } | { ok: false; errors: ImportIssue[] };

const BOOK_KEYS = new Set([
  'slug',
  'title',
  'author',
  'narrator',
  'category',
  'description',
  'language',
  'ongoing',
  'cover',
  'parts',
]);
const PART_KEYS = new Set(['number', 'title', 'file', 'size', 'sha256', 'durationSeconds']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();
const multiLine = (value: string) => value.replace(/\r\n?/g, '\n').trim();
const limit = (n: number) => n.toLocaleString('en-US');

class Issues {
  readonly list: ImportIssue[] = [];
  add(path: string, message: string) {
    if (this.list.length < MAX_ISSUES) this.list.push({ path, message });
  }
}

/** An optional text field: absent, null or blank means "not given". */
function optionalText(
  raw: unknown,
  path: string,
  max: number,
  fold: (value: string) => string,
  issues: Issues,
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    issues.add(path, `"${path}" must be text.`);
    return null;
  }
  const value = fold(raw);
  if (value === '') return null;
  if (value.length > max) {
    issues.add(path, `Keep "${path}" to ${limit(max)} characters or fewer.`);
    return null;
  }
  return value;
}

function parsePart(raw: unknown, index: number, issues: Issues): ImportPart | null {
  const at = (field: string) => `parts[${index}].${field}`;
  const label = `Part ${index + 1}`;
  if (!isObject(raw)) {
    issues.add(`parts[${index}]`, `${label} must be an object.`);
    return null;
  }
  const before = issues.list.length;

  for (const key of Object.keys(raw)) {
    if (!PART_KEYS.has(key)) issues.add(at(key), `${label}: unknown field "${key}".`);
  }

  const number = raw.number;
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    issues.add(at('number'), `${label}: "number" must be a whole number.`);
  } else if (number !== index + 1) {
    issues.add(
      at('number'),
      `${label} is numbered ${number}; parts must be numbered 1, 2, 3… in order, each once.`,
    );
  }

  let title = '';
  if (typeof raw.title !== 'string' || oneLine(raw.title) === '') {
    issues.add(at('title'), `${label}: enter a title.`);
  } else {
    title = oneLine(raw.title);
    if (title.length > TITLE_MAX) {
      issues.add(
        at('title'),
        `${label}: keep the title to ${limit(TITLE_MAX)} characters or fewer.`,
      );
    }
  }

  const file = raw.file;
  if (typeof file !== 'string' || file === '') {
    issues.add(at('file'), `${label}: "file" must be the file name, like 01.mp3.`);
  } else if (/[\\/]/.test(file) || file.length > FILE_NAME_MAX) {
    issues.add(at('file'), `${label}: "file" must be a plain file name without folders.`);
  } else {
    const checked = checkAudioFile({ name: file, type: '', size: 1 });
    if (!checked.ok) issues.add(at('file'), `${label}: ${checked.reason}`);
  }

  const size = raw.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size)) {
    issues.add(at('size'), `${label}: "size" must be the file size in bytes.`);
  } else {
    const checked = checkAudioFile({ name: 'a.mp3', type: '', size });
    if (!checked.ok) issues.add(at('size'), `${label}: ${checked.reason}`);
  }

  const sha = typeof raw.sha256 === 'string' ? raw.sha256.toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(sha)) {
    issues.add(at('sha256'), `${label}: "sha256" must be 64 hex characters.`);
  }

  const duration = raw.durationSeconds;
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > DURATION_MAX_SECONDS
  ) {
    issues.add(at('durationSeconds'), `${label}: "durationSeconds" must be a length above zero.`);
  }

  if (issues.list.length > before) return null;
  return {
    number: number as number,
    title,
    file: file as string,
    size: size as number,
    sha256: sha,
    durationSeconds: duration as number,
  };
}

export function parseBookJson(raw: unknown): ParsedBook {
  if (!isObject(raw)) {
    return { ok: false, errors: [{ path: '', message: 'book.json must be a JSON object.' }] };
  }
  const issues = new Issues();
  const warnings: string[] = [];

  for (const key of Object.keys(raw)) {
    if (!BOOK_KEYS.has(key)) issues.add(key, `Unknown field "${key}".`);
  }

  let slug = '';
  if (typeof raw.slug !== 'string' || raw.slug === '') {
    issues.add('slug', '"slug" is required: lower-case Latin words joined by hyphens.');
  } else if (raw.slug.length > SLUG_MAX || !isSlug(raw.slug)) {
    issues.add(
      'slug',
      `"slug" must be lower-case Latin words and digits joined by hyphens, at most ${SLUG_MAX} characters.`,
    );
  } else slug = raw.slug;

  let title = '';
  if (typeof raw.title !== 'string' || oneLine(raw.title) === '') {
    issues.add('title', '"title" is required.');
  } else {
    title = oneLine(raw.title);
    if (title.length > TITLE_MAX) {
      issues.add('title', `Keep "title" to ${limit(TITLE_MAX)} characters or fewer.`);
    }
  }

  const author = optionalText(raw.author, 'author', NAME_MAX, oneLine, issues);
  const narrator = optionalText(raw.narrator, 'narrator', NAME_MAX, oneLine, issues);
  const description = optionalText(
    raw.description,
    'description',
    DESCRIPTION_MAX,
    multiLine,
    issues,
  );

  let category: string | null = null;
  if (raw.category !== undefined && raw.category !== null && raw.category !== '') {
    if (
      typeof raw.category === 'string' &&
      raw.category.length <= SLUG_MAX &&
      isSlug(raw.category)
    ) {
      category = raw.category;
    } else issues.add('category', '"category" must be a category slug, like fiction.');
  }

  let language: BookLanguage = 'uk';
  if (raw.language !== undefined) {
    if (
      typeof raw.language === 'string' &&
      (LANGUAGES as readonly string[]).includes(raw.language)
    ) {
      language = raw.language as BookLanguage;
    } else issues.add('language', '"language" must be "uk" or "en".');
  }

  let ongoing = false;
  if (raw.ongoing !== undefined) {
    if (typeof raw.ongoing === 'boolean') ongoing = raw.ongoing;
    else issues.add('ongoing', '"ongoing" must be true or false.');
  }

  if (raw.cover !== undefined) {
    warnings.push('"cover" was ignored: cover images are not imported yet.');
  }

  const parts: ImportPart[] = [];
  if (!Array.isArray(raw.parts) || raw.parts.length === 0) {
    issues.add('parts', '"parts" must list at least one part.');
  } else if (raw.parts.length > MAX_BOOK_PARTS) {
    issues.add('parts', `A book can have at most ${MAX_BOOK_PARTS} parts.`);
  } else {
    raw.parts.forEach((item, index) => {
      const parsed = parsePart(item, index, issues);
      if (parsed) parts.push(parsed);
    });
  }

  if (issues.list.length > 0) return { ok: false, errors: issues.list };
  return {
    ok: true,
    value: { slug, title, author, narrator, category, description, language, ongoing, parts },
    warnings,
  };
}
