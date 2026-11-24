/**
 * The two sync route handlers (Phase 6b), with everything they touch passed in, so they are tested
 * without Next.js and without mocking modules (same shape as `features/admin/import/handlers.ts`).
 * `app/api/sync/**` binds them to the real database and the Supabase session.
 *
 * Order of checks for a push: same-origin (403) → listener (401) → body: type (415), size (413),
 * JSON (400) → shape (422). A pull: listener (401) → query (400).
 */
import { NextResponse } from 'next/server';
import {
  applyPush,
  readChanges,
  touchDevice,
  type PushResult,
  type SyncDb,
  type Changes,
} from './data';
import { parsePullQuery, parsePushBody, readJsonBody } from './request';

export interface SyncUser {
  id: string;
}

export interface SyncDeps {
  /** The signed-in listener, from the Supabase session cookie (`getUser()`), or null. */
  resolveUser: () => Promise<SyncUser | null>;
  /** For writes: the push runs in one transaction on this handle. */
  db: () => SyncDb;
  /** For the pull read; retried with a fresh connection (`readDb`). */
  readDb: <T>(label: string, run: (db: SyncDb) => Promise<T>) => Promise<T>;
  now?: () => number;
}

const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  Vary: 'Cookie',
};

function reply(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

const error = (status: number, code: string, message: string, extra: object = {}) =>
  reply(status, { ok: false, error: code, message, ...extra });

const unauthorized = () => error(401, 'unauthorized', 'Sign in to sync.');

/**
 * A browser request must come from this site. `Sec-Fetch-Site` is the strong signal; `Origin` is
 * the fallback for older browsers. A request with neither (not a browser) passes: it cannot
 * carry the listener's cookie from another site, which is what this guards.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' || site === 'none';
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    new URL(request.url).host;
  return host === own;
}

function pushBody(result: PushResult) {
  return {
    ok: true,
    serverNow: result.serverNow,
    cursor: result.cursor,
    applied: result.applied,
    dropped: result.dropped,
  };
}

function pullBody(changes: Changes) {
  return {
    ok: true,
    cursor: changes.cursor,
    serverNow: changes.serverNow,
    hasMore: changes.hasMore,
    progress: changes.progress,
    flags: changes.flags,
    history: changes.history,
    settings: changes.settings,
    devices: changes.devices,
  };
}

const INTERNAL = 'Something went wrong. Send the same request again.';

export async function handlePush(request: Request, deps: SyncDeps): Promise<Response> {
  if (!isSameOrigin(request)) {
    return error(403, 'forbidden', 'Requests must come from this site.');
  }
  let user: SyncUser | null;
  try {
    user = await deps.resolveUser();
  } catch (e) {
    console.error('sync push: could not resolve the listener', e);
    return error(500, 'internal', INTERNAL);
  }
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (!body.ok) return error(body.status, body.code, body.message);
  const parsed = parsePushBody(body.body);
  if (!parsed.ok) {
    return error(422, 'invalid_request', 'The request cannot be applied as described.', {
      errors: parsed.errors,
    });
  }

  try {
    const now = deps.now;
    const result = await deps
      .db()
      .transaction((tx) => applyPush(tx, user.id, parsed.value, { now }));
    return reply(200, pushBody(result));
  } catch (e) {
    console.error('sync push failed', e);
    return error(500, 'internal', INTERNAL);
  }
}

export async function handlePull(request: Request, deps: SyncDeps): Promise<Response> {
  let user: SyncUser | null;
  try {
    user = await deps.resolveUser();
  } catch (e) {
    console.error('sync pull: could not resolve the listener', e);
    return error(500, 'internal', INTERNAL);
  }
  if (!user) return unauthorized();

  const query = parsePullQuery(new URL(request.url).searchParams);
  if (!query.ok) {
    return error(400, 'invalid_query', 'The query cannot be used as described.', {
      errors: query.errors,
    });
  }

  try {
    const { since, deviceId } = query.value;
    const changes = await deps.readDb('sync:pull', (db) =>
      readChanges(db, user.id, since, { now: deps.now }),
    );
    if (deviceId) {
      // Best effort: "last seen" is a nicety and must never fail a pull.
      try {
        await touchDevice(deps.db(), user.id, deviceId, { now: deps.now });
      } catch (e) {
        console.error('sync pull: could not note the device', e);
      }
    }
    return reply(200, pullBody(changes));
  } catch (e) {
    console.error('sync pull failed', e);
    return error(500, 'internal', INTERNAL);
  }
}
