/**
 * The two route handlers of the import (Phase 4e), with everything they touch passed in, so they
 * are tested without Next.js and without mocking modules. `app/api/admin/import/**` binds them
 * to the real database, bucket and token.
 *
 * Every request is checked for the token here as well as in `proxy.ts`: no handler depends on
 * the matcher alone.
 */
import { NextResponse } from 'next/server';
import { isImportRequestAuthorised } from '@/lib/auth/admin/import-token';
import type { AdminDb } from '../data/books';
import {
  beginImport,
  completeImport,
  loadImportContext,
  type BeginImportResult,
  type CompleteImportResult,
  type ImportStorage,
} from './data';
import { parseBeginBody, parseCompleteBody, readJsonBody } from './request';

export interface ImportDeps {
  /** For writes. */
  db: () => AdminDb;
  /** For the reads that decide what to do; retried with a fresh connection (`readDb`). */
  readDb: <T>(label: string, run: (db: AdminDb) => Promise<T>) => Promise<T>;
  storage: ImportStorage;
  /** `revalidateCatalogue`: called after anything that changed. */
  revalidate: () => void;
  /** `ADMIN_IMPORT_TOKEN`. */
  token: string | undefined;
}

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

const error = (status: number, code: string, message: string, extra: object = {}) =>
  reply(status, { ok: false, error: code, message, ...extra });

const INTERNAL =
  'Something went wrong. Look at the book in the admin, then send the same request again.';

/** Auth and body reading, shared by both routes. */
async function open(request: Request, deps: ImportDeps) {
  if (!isImportRequestAuthorised(request.headers, deps.token)) {
    return { response: reply(401, { error: 'unauthorized' }) };
  }
  const body = await readJsonBody(request);
  if (!body.ok) return { response: error(body.status, body.code, body.message) };
  return { body: body.body };
}

function beginResponse(result: BeginImportResult, warnings: string[]) {
  if (result.ok) {
    return reply(200, {
      ok: true,
      book: result.book,
      parts: result.parts,
      deferred: result.deferred,
      warnings: [...warnings, ...result.warnings],
    });
  }
  switch (result.reason) {
    case 'invalid':
      return error(422, 'invalid_book', 'The book cannot be imported as described.', {
        errors: result.errors,
      });
    case 'book_deleted':
      return error(
        409,
        'book_deleted',
        'A book with this slug was deleted. Restore it in the database, or use another slug.',
      );
    case 'slug_taken':
      return error(409, 'slug_taken', 'Another request took this slug just now. Send it again.');
  }
}

/** POST /api/admin/import: plan the import and hand out upload addresses. */
export async function handleBegin(request: Request, deps: ImportDeps): Promise<Response> {
  const opened = await open(request, deps);
  if (opened.response) return opened.response;

  const parsed = parseBeginBody(opened.body);
  if (!parsed.ok) {
    return error(422, 'invalid_request', 'The request is not valid.', { errors: parsed.errors });
  }
  try {
    const ctx = await deps.readDb('import:context', (db) =>
      loadImportContext(db, parsed.book.slug),
    );
    const result = await beginImport(deps.db(), deps.storage, ctx, parsed.book);
    if (!result.ok || result.changed) deps.revalidate();
    return beginResponse(result, parsed.warnings);
  } catch (cause) {
    console.error('Starting an import failed', cause);
    deps.revalidate(); // it may have written before it failed
    return error(500, 'internal_error', INTERNAL);
  }
}

function completeResponse(result: CompleteImportResult) {
  if (!result.ok) {
    return result.reason === 'not_found'
      ? error(404, 'not_found', 'There is no book with this slug. Send book.json first.')
      : error(
          409,
          'book_deleted',
          'A book with this slug was deleted. Restore it in the database, or use another slug.',
        );
  }
  // 200 when every listed part is ready (a refused publish is reported in `publish`, not an error).
  return reply(result.allReady ? 200 : 409, {
    ok: result.allReady,
    book: result.book,
    parts: result.parts,
    publish: result.publish,
  });
}

/** POST /api/admin/import/complete: check the uploaded files, make the parts ready, maybe publish. */
export async function handleComplete(request: Request, deps: ImportDeps): Promise<Response> {
  const opened = await open(request, deps);
  if (opened.response) return opened.response;

  const parsed = parseCompleteBody(opened.body);
  if (!parsed.ok) {
    return error(422, 'invalid_request', 'The request is not valid.', { errors: parsed.errors });
  }
  try {
    const result = await completeImport(deps.db(), deps.storage, parsed.value);
    if (result.ok && result.changed) deps.revalidate();
    return completeResponse(result);
  } catch (cause) {
    console.error('Completing an import failed', cause);
    deps.revalidate();
    return error(500, 'internal_error', INTERNAL);
  }
}
