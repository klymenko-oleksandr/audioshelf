/**
 * The two requests of sync (Phase 6b), read and checked without touching the database. Strict, like
 * the 4e `book.json` parser: unknown keys are rejected, every problem is reported with its path,
 * and the sizes are capped. Pure apart from reading the `Request` body.
 *
 *   POST /api/sync/push   { deviceId, deviceName, clientNow, merge?, changes: { progress[], flags[], history[], settings[] } }
 *   GET  /api/sync/pull   ?since=<seq>&deviceId=<uuid>
 *
 * Shape only. Whether a setting key or value is allowed, and whether a book exists, are decided
 * later (`merge.ts`, `data.ts`) and drop the item instead of failing the batch.
 */
import { MAX_SPEED, MIN_SPEED } from '@/features/player/core/rules';
import type { Batch, FlagItem, HistoryItem, ProgressItem, SettingItem } from './merge';

/** A push is a few hundred small items at most; the whole body stays under this. */
export const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_ITEMS_PER_LIST = 500;
export const MAX_DEVICE_NAME = 80;
export const MAX_SETTING_KEY = 64;
export const MAX_ISSUES = 50;
/** A position or a length in seconds; far beyond any audiobook, so a typo cannot store nonsense. */
export const MAX_SECONDS = 10_000_000;
/** The last time a JavaScript `Date` can hold. */
export const MAX_TIME_MS = 8_640_000_000_000_000;

export interface SyncIssue {
  path: string;
  message: string;
}

export type BodyResult =
  | { ok: true; body: unknown }
  | {
      ok: false;
      status: 400 | 413 | 415;
      code: 'invalid_json' | 'payload_too_large' | 'unsupported_media_type';
      message: string;
    };

const TOO_LARGE = {
  ok: false,
  status: 413,
  code: 'payload_too_large',
  message: `The request body is larger than ${MAX_BODY_BYTES / 1024 / 1024} MB.`,
} as const;

/**
 * JSON only (a `sendBeacon` Blob of type `application/json` qualifies), at most 1 MB. The body is
 * read in pieces and abandoned as soon as it is too long, so a huge upload is never buffered.
 */
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
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return TOO_LARGE;

  let text: string;
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = request.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
          void reader.cancel().catch(() => {});
          return TOO_LARGE;
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, status: 400, code: 'invalid_json', message: 'The body could not be read.' };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, code: 'invalid_json', message: 'The body is not valid JSON.' };
  }
}

// ── Field checks ───────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Collects issues up to a cap, so a hostile body cannot make the answer huge. */
class Issues {
  readonly list: SyncIssue[] = [];
  add(path: string, message: string) {
    if (this.list.length < MAX_ISSUES) this.list.push({ path, message });
  }
  get count() {
    return this.list.length;
  }
}

function rejectUnknown(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: Issues,
) {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) {
      issues.add(path ? `${path}.${key}` : key, `Unknown field "${key}".`);
    }
  }
}

function uuid(raw: unknown, path: string, issues: Issues): string {
  if (typeof raw === 'string' && UUID.test(raw)) return raw.toLowerCase();
  issues.add(path, 'Must be a UUID.');
  return '';
}

function time(raw: unknown, path: string, issues: Issues): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_TIME_MS)
    return raw;
  issues.add(path, 'Must be a time in milliseconds since 1970 (a whole number).');
  return 0;
}

/** A time that may be missing or `null` (never set). */
function optionalTime(raw: unknown, path: string, issues: Issues): number | null {
  return raw === undefined || raw === null ? null : time(raw, path, issues);
}

function seconds(raw: unknown, path: string, issues: Issues): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= MAX_SECONDS) return raw;
  issues.add(path, `Must be a number of seconds from 0 to ${MAX_SECONDS}.`);
  return 0;
}

function speed(raw: unknown, path: string, issues: Issues): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= MIN_SPEED && raw <= MAX_SPEED) {
    return raw;
  }
  issues.add(path, `Must be a speed from ${MIN_SPEED} to ${MAX_SPEED}.`);
  return 1;
}

function bool(raw: unknown, path: string, issues: Issues): boolean {
  if (typeof raw === 'boolean') return raw;
  issues.add(path, 'Must be true or false.');
  return false;
}

// ── Items ──────────────────────────────────────────────────────────────────────

type Parse<T> = (raw: unknown, path: string, issues: Issues) => T | null;

/** An object item: unknown keys rejected, `read` fills the fields. `null` when anything was wrong. */
function item<T>(
  allowed: readonly string[],
  read: (raw: Record<string, unknown>, path: string, issues: Issues) => T,
): Parse<T> {
  return (raw, path, issues) => {
    if (!isObject(raw)) {
      issues.add(path, 'Must be an object.');
      return null;
    }
    const before = issues.count;
    rejectUnknown(raw, allowed, path, issues);
    const value = read(raw, path, issues);
    return issues.count > before ? null : value;
  };
}

const required = (raw: Record<string, unknown>, key: string, path: string, issues: Issues) => {
  if (!(key in raw)) issues.add(`${path}.${key}`, `"${key}" is required.`);
};

const parseProgress = item<ProgressItem>(
  ['bookId', 'position', 'duration', 'speed', 'finished', 'dismissedAt', 'deletedAt', 'updatedAt'],
  (raw, path, issues) => {
    for (const key of ['bookId', 'position', 'duration', 'speed', 'finished', 'updatedAt']) {
      required(raw, key, path, issues);
    }
    return {
      bookId: uuid(raw.bookId, `${path}.bookId`, issues),
      position: seconds(raw.position, `${path}.position`, issues),
      duration: seconds(raw.duration, `${path}.duration`, issues),
      speed: speed(raw.speed, `${path}.speed`, issues),
      finished: bool(raw.finished, `${path}.finished`, issues),
      dismissedAt: optionalTime(raw.dismissedAt, `${path}.dismissedAt`, issues),
      deletedAt: optionalTime(raw.deletedAt, `${path}.deletedAt`, issues),
      updatedAt: time(raw.updatedAt, `${path}.updatedAt`, issues),
    };
  },
);

const FLAG_KINDS = ['like', 'listen_later'] as const;

const parseFlag = item<FlagItem>(
  ['bookId', 'kind', 'addedAt', 'deletedAt', 'updatedAt'],
  (raw, path, issues) => {
    for (const key of ['bookId', 'kind', 'addedAt', 'updatedAt']) required(raw, key, path, issues);
    const kind = FLAG_KINDS.find((k) => k === raw.kind);
    if (!kind && 'kind' in raw) issues.add(`${path}.kind`, 'Must be "like" or "listen_later".');
    return {
      bookId: uuid(raw.bookId, `${path}.bookId`, issues),
      kind: kind ?? 'like',
      addedAt: time(raw.addedAt, `${path}.addedAt`, issues),
      deletedAt: optionalTime(raw.deletedAt, `${path}.deletedAt`, issues),
      updatedAt: time(raw.updatedAt, `${path}.updatedAt`, issues),
    };
  },
);

const parseHistory = item<HistoryItem>(
  ['bookId', 'startedAt', 'lastPlayedAt', 'finishedAt', 'deletedAt', 'updatedAt'],
  (raw, path, issues) => {
    for (const key of ['bookId', 'startedAt', 'lastPlayedAt', 'updatedAt']) {
      required(raw, key, path, issues);
    }
    return {
      bookId: uuid(raw.bookId, `${path}.bookId`, issues),
      startedAt: time(raw.startedAt, `${path}.startedAt`, issues),
      lastPlayedAt: time(raw.lastPlayedAt, `${path}.lastPlayedAt`, issues),
      finishedAt: optionalTime(raw.finishedAt, `${path}.finishedAt`, issues),
      deletedAt: optionalTime(raw.deletedAt, `${path}.deletedAt`, issues),
      updatedAt: time(raw.updatedAt, `${path}.updatedAt`, issues),
    };
  },
);

const parseSetting = item<SettingItem>(['key', 'value', 'updatedAt'], (raw, path, issues) => {
  for (const key of ['key', 'value', 'updatedAt']) required(raw, key, path, issues);
  const key = raw.key;
  if (typeof key !== 'string' || key === '' || key.length > MAX_SETTING_KEY) {
    issues.add(`${path}.key`, `Must be a name of 1 to ${MAX_SETTING_KEY} characters.`);
  }
  return {
    key: typeof key === 'string' ? key : '',
    value: raw.value,
    updatedAt: time(raw.updatedAt, `${path}.updatedAt`, issues),
  };
});

function list<T>(raw: unknown, path: string, parse: Parse<T>, issues: Issues): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.add(path, 'Must be a list (it may be empty).');
    return [];
  }
  if (raw.length > MAX_ITEMS_PER_LIST) {
    issues.add(
      path,
      `At most ${MAX_ITEMS_PER_LIST} items per request; send the rest in another one.`,
    );
    return [];
  }
  const out: T[] = [];
  raw.forEach((entry, index) => {
    const parsed = parse(entry, `${path}[${index}]`, issues);
    if (parsed !== null) out.push(parsed);
  });
  return out;
}

// ── The two requests ───────────────────────────────────────────────────────────

export interface PushRequest {
  deviceId: string;
  deviceName: string;
  clientNow: number;
  /** First sign-in: the furthest position wins and finished is a union. */
  merge: boolean;
  changes: Batch;
}

export type PushBody = { ok: true; value: PushRequest } | { ok: false; errors: SyncIssue[] };

export function parsePushBody(raw: unknown): PushBody {
  if (!isObject(raw)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'The request body must be a JSON object.' }],
    };
  }
  const issues = new Issues();
  rejectUnknown(raw, ['deviceId', 'deviceName', 'clientNow', 'merge', 'changes'], '', issues);
  for (const key of ['deviceId', 'deviceName', 'clientNow', 'changes']) {
    if (!(key in raw)) issues.add(key, `"${key}" is required.`);
  }

  const deviceId = 'deviceId' in raw ? uuid(raw.deviceId, 'deviceId', issues) : '';
  let deviceName = '';
  if ('deviceName' in raw) {
    if (typeof raw.deviceName !== 'string' || raw.deviceName.length > MAX_DEVICE_NAME) {
      issues.add('deviceName', `Must be text of at most ${MAX_DEVICE_NAME} characters.`);
    } else {
      deviceName = raw.deviceName.trim();
    }
  }
  const clientNow = 'clientNow' in raw ? time(raw.clientNow, 'clientNow', issues) : 0;
  let merge = false;
  if (raw.merge !== undefined) {
    if (typeof raw.merge === 'boolean') merge = raw.merge;
    else issues.add('merge', 'Must be true or false.');
  }

  const changes: Batch = { progress: [], flags: [], history: [], settings: [] };
  if ('changes' in raw) {
    if (!isObject(raw.changes)) {
      issues.add(
        'changes',
        'Must be an object with the lists progress, flags, history and settings.',
      );
    } else {
      rejectUnknown(raw.changes, ['progress', 'flags', 'history', 'settings'], 'changes', issues);
      changes.progress = list(raw.changes.progress, 'changes.progress', parseProgress, issues);
      changes.flags = list(raw.changes.flags, 'changes.flags', parseFlag, issues);
      changes.history = list(raw.changes.history, 'changes.history', parseHistory, issues);
      changes.settings = list(raw.changes.settings, 'changes.settings', parseSetting, issues);
    }
  }

  if (issues.count > 0) return { ok: false, errors: issues.list };
  return { ok: true, value: { deviceId, deviceName, clientNow, merge, changes } };
}

export interface PullQuery {
  /** Every row with a higher `seq` is returned. 0 (the default) is "everything". */
  since: number;
  /** The asking device, so the server can note when it was last seen. */
  deviceId: string | null;
}

export type PullParse = { ok: true; value: PullQuery } | { ok: false; errors: SyncIssue[] };

export function parsePullQuery(params: URLSearchParams): PullParse {
  const issues = new Issues();
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) issues.add(key, `"${key}" is given more than once.`);
    else if (key !== 'since' && key !== 'deviceId') issues.add(key, `Unknown parameter "${key}".`);
    seen.add(key);
  }
  let since = 0;
  const rawSince = params.get('since');
  if (rawSince !== null) {
    if (/^\d{1,16}$/.test(rawSince) && Number.isSafeInteger(Number(rawSince))) {
      since = Number(rawSince);
    } else {
      issues.add(
        'since',
        'Must be the cursor from the last pull (a whole number, 0 for everything).',
      );
    }
  }
  let deviceId: string | null = null;
  const rawDevice = params.get('deviceId');
  if (rawDevice !== null) {
    if (UUID.test(rawDevice)) deviceId = rawDevice.toLowerCase();
    else issues.add('deviceId', 'Must be a UUID.');
  }
  if (issues.count > 0) return { ok: false, errors: issues.list };
  return { ok: true, value: { since, deviceId } };
}
