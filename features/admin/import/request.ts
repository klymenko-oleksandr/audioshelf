/**
 * The two requests of the import (Phase 4e): reading the body safely, and checking its shape.
 * Pure apart from reading the `Request`, so the rules are covered by unit tests.
 *
 *   POST /api/admin/import           { "book": <book.json> }
 *   POST /api/admin/import/complete  { "slug", "parts": [{ "number", "uploadId"?, "etags"? }], "publish"? }
 */
import { isSlug } from '@/lib/slug';
import { parseBookJson, SLUG_MAX, type ImportBook, type ImportIssue } from './book-json';

/** Both bodies are small JSON; the audio never passes through the server. */
export const MAX_BODY_BYTES = 256 * 1024;

/** One call finishes at most this many parts, so it stays well inside a function's time limit. */
export const MAX_COMPLETE_PARTS = 25;

const MAX_ETAGS = 10_000;
const MAX_ETAG_LENGTH = 200;
const MAX_UPLOAD_ID_LENGTH = 1024;

export type BodyResult =
  | { ok: true; body: unknown }
  | {
      ok: false;
      status: 400 | 413 | 415;
      code: 'invalid_json' | 'payload_too_large' | 'unsupported_media_type';
      message: string;
    };

export async function readJsonBody(request: Request): Promise<BodyResult> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') {
    return {
      ok: false,
      status: 415,
      code: 'unsupported_media_type',
      message: 'Send the request as application/json.',
    };
  }
  const tooLarge = {
    ok: false,
    status: 413,
    code: 'payload_too_large',
    message: `The request body is larger than ${MAX_BODY_BYTES / 1024} KB.`,
  } as const;

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge;

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, code: 'invalid_json', message: 'The body could not be read.' };
  }
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return tooLarge;
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, code: 'invalid_json', message: 'The body is not valid JSON.' };
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const notAnObject: ImportIssue[] = [
  { path: '', message: 'The request body must be a JSON object.' },
];

export type BeginBody =
  { ok: true; book: ImportBook; warnings: string[] } | { ok: false; errors: ImportIssue[] };

export function parseBeginBody(raw: unknown): BeginBody {
  if (!isObject(raw)) return { ok: false, errors: notAnObject };
  const errors: ImportIssue[] = [];
  for (const key of Object.keys(raw)) {
    if (key !== 'book') errors.push({ path: key, message: `Unknown field "${key}".` });
  }
  if (!('book' in raw)) {
    errors.push({ path: 'book', message: '"book" is required: the contents of book.json.' });
    return { ok: false, errors };
  }
  const parsed = parseBookJson(raw.book);
  if (!parsed.ok) {
    errors.push(
      ...parsed.errors.map((e) => ({
        path: e.path ? `book.${e.path}` : 'book',
        message: e.message,
      })),
    );
  }
  if (errors.length > 0 || !parsed.ok) return { ok: false, errors };
  return { ok: true, book: parsed.value, warnings: parsed.warnings };
}

export interface CompleteItem {
  number: number;
  /** A file over 100 MB was sent in parts: the upload id from the plan, and every part's ETag in order. */
  uploadId?: string;
  etags?: string[];
}

export interface CompleteRequest {
  slug: string;
  parts: CompleteItem[];
  publish: boolean;
}

export type CompleteBody =
  { ok: true; value: CompleteRequest } | { ok: false; errors: ImportIssue[] };

function parseCompleteItem(
  raw: unknown,
  index: number,
  errors: ImportIssue[],
): CompleteItem | null {
  const at = (field: string) => `parts[${index}]${field ? `.${field}` : ''}`;
  if (!isObject(raw)) {
    errors.push({ path: at(''), message: 'Each part must be an object.' });
    return null;
  }
  const before = errors.length;
  for (const key of Object.keys(raw)) {
    if (!['number', 'uploadId', 'etags'].includes(key)) {
      errors.push({ path: at(key), message: `Unknown field "${key}".` });
    }
  }
  const { number, uploadId, etags } = raw;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    errors.push({ path: at('number'), message: '"number" must be a part number, from 1.' });
  }
  const item: CompleteItem = { number: number as number };
  if (uploadId !== undefined || etags !== undefined) {
    if (typeof uploadId !== 'string' || uploadId === '' || uploadId.length > MAX_UPLOAD_ID_LENGTH) {
      errors.push({ path: at('uploadId'), message: '"uploadId" is needed together with "etags".' });
    } else item.uploadId = uploadId;
    if (
      !Array.isArray(etags) ||
      etags.length === 0 ||
      etags.length > MAX_ETAGS ||
      etags.some((e) => typeof e !== 'string' || e.trim() === '' || e.length > MAX_ETAG_LENGTH)
    ) {
      errors.push({
        path: at('etags'),
        message: '"etags" must list the ETag of every uploaded piece, in order.',
      });
    } else item.etags = etags as string[];
  }
  return errors.length > before ? null : item;
}

export function parseCompleteBody(raw: unknown): CompleteBody {
  if (!isObject(raw)) return { ok: false, errors: notAnObject };
  const errors: ImportIssue[] = [];
  for (const key of Object.keys(raw)) {
    if (!['slug', 'parts', 'publish'].includes(key)) {
      errors.push({ path: key, message: `Unknown field "${key}".` });
    }
  }

  const slug = raw.slug;
  if (typeof slug !== 'string' || slug.length > SLUG_MAX || !isSlug(slug)) {
    errors.push({ path: 'slug', message: '"slug" must be the slug of the book being imported.' });
  }

  let publish = false;
  if (raw.publish !== undefined) {
    if (typeof raw.publish === 'boolean') publish = raw.publish;
    else errors.push({ path: 'publish', message: '"publish" must be true or false.' });
  }

  const parts: CompleteItem[] = [];
  if (!Array.isArray(raw.parts)) {
    errors.push({ path: 'parts', message: '"parts" must be a list (it may be empty).' });
  } else if (raw.parts.length > MAX_COMPLETE_PARTS) {
    errors.push({
      path: 'parts',
      message: `Finish at most ${MAX_COMPLETE_PARTS} parts per request.`,
    });
  } else {
    const seen = new Set<number>();
    raw.parts.forEach((item, index) => {
      const parsed = parseCompleteItem(item, index, errors);
      if (!parsed) return;
      if (seen.has(parsed.number)) {
        errors.push({
          path: `parts[${index}].number`,
          message: `Part ${parsed.number} is listed twice.`,
        });
      } else {
        seen.add(parsed.number);
        parts.push(parsed);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  parts.sort((a, b) => a.number - b.number);
  return { ok: true, value: { slug: slug as string, parts, publish } };
}
