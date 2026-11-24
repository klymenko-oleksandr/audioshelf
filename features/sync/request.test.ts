// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_BYTES,
  MAX_DEVICE_NAME,
  MAX_ISSUES,
  MAX_ITEMS_PER_LIST,
  MAX_TIME_MS,
  parsePullQuery,
  parsePushBody,
  readJsonBody,
} from './request';

const DEVICE = 'AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOOK = '11111111-1111-4111-8111-111111111111';
const T = 1_800_000_000_000;

const progress = (o: Record<string, unknown> = {}) => ({
  bookId: BOOK,
  position: 120.5,
  duration: 3600,
  speed: 1.25,
  finished: false,
  updatedAt: T,
  ...o,
});
const flag = (o: Record<string, unknown> = {}) => ({
  bookId: BOOK,
  kind: 'like',
  addedAt: T,
  updatedAt: T,
  ...o,
});
const history = (o: Record<string, unknown> = {}) => ({
  bookId: BOOK,
  startedAt: T - 5000,
  lastPlayedAt: T,
  updatedAt: T,
  ...o,
});
const setting = (o: Record<string, unknown> = {}) => ({
  key: 'theme',
  value: 'dark',
  updatedAt: T,
  ...o,
});
const body = (o: Record<string, unknown> = {}) => ({
  deviceId: DEVICE,
  deviceName: 'Sasha’s iPhone',
  clientNow: T,
  changes: {},
  ...o,
});

function issues(raw: unknown) {
  const parsed = parsePushBody(raw);
  if (parsed.ok) throw new Error('expected the body to be refused');
  return parsed.errors;
}
const paths = (raw: unknown) => issues(raw).map((e) => e.path);

describe('parsePushBody', () => {
  it('accepts an empty push', () => {
    const parsed = parsePushBody(body());
    expect(parsed).toEqual({
      ok: true,
      value: {
        deviceId: DEVICE.toLowerCase(),
        deviceName: 'Sasha’s iPhone',
        clientNow: T,
        merge: false,
        changes: { progress: [], flags: [], history: [], settings: [] },
      },
    });
  });

  it('accepts every kind of item and fills the optional fields', () => {
    const parsed = parsePushBody(
      body({
        merge: true,
        changes: {
          progress: [progress(), progress({ dismissedAt: T, deletedAt: null })],
          flags: [flag(), flag({ kind: 'listen_later', deletedAt: T + 1 })],
          history: [history(), history({ finishedAt: T })],
          settings: [setting(), setting({ key: 'skipBackSeconds', value: 30 })],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.merge).toBe(true);
    expect(parsed.value.changes.progress[0]).toEqual({
      bookId: BOOK,
      position: 120.5,
      duration: 3600,
      speed: 1.25,
      finished: false,
      dismissedAt: null,
      deletedAt: null,
      updatedAt: T,
    });
    expect(parsed.value.changes.progress[1]!.dismissedAt).toBe(T);
    expect(parsed.value.changes.flags[1]).toMatchObject({ kind: 'listen_later', deletedAt: T + 1 });
    expect(parsed.value.changes.history[1]!.finishedAt).toBe(T);
    expect(parsed.value.changes.history[0]!.finishedAt).toBeNull();
    expect(parsed.value.changes.settings[1]).toEqual({
      key: 'skipBackSeconds',
      value: 30,
      updatedAt: T,
    });
  });

  it('lists that are left out are empty', () => {
    const parsed = parsePushBody(body({ changes: { flags: [flag()] } }));
    expect(parsed.ok && parsed.value.changes.progress).toEqual([]);
  });

  it('lower-cases ids and trims the device name', () => {
    const parsed = parsePushBody(
      body({
        deviceName: '  Kitchen tablet ',
        changes: { flags: [flag({ bookId: BOOK.toUpperCase() })] },
      }),
    );
    expect(parsed.ok && parsed.value.deviceName).toBe('Kitchen tablet');
    expect(parsed.ok && parsed.value.changes.flags[0]!.bookId).toBe(BOOK);
  });

  it('keeps a setting value of any JSON type (checked later against the allowed values)', () => {
    for (const value of ['x', 1, true, null, { a: 1 }, [1]]) {
      const parsed = parsePushBody(body({ changes: { settings: [setting({ value })] } }));
      expect(parsed.ok && parsed.value.changes.settings[0]!.value).toEqual(value);
    }
  });

  describe('strictness', () => {
    it('refuses a body that is not an object', () => {
      for (const raw of [null, 5, 'x', [], [body()]]) {
        expect(issues(raw)).toEqual([
          { path: '', message: 'The request body must be a JSON object.' },
        ]);
      }
    });

    it('refuses unknown fields at every level, with their paths', () => {
      expect(paths(body({ extra: 1 }))).toEqual(['extra']);
      expect(paths(body({ changes: { bookmarks: [] } }))).toEqual(['changes.bookmarks']);
      expect(paths(body({ changes: { progress: [progress({ colour: 'red' })] } }))).toEqual([
        'changes.progress[0].colour',
      ]);
      expect(paths(body({ changes: { flags: [flag({ x: 1 })] } }))).toEqual(['changes.flags[0].x']);
      expect(paths(body({ changes: { history: [history({ x: 1 })] } }))).toEqual([
        'changes.history[0].x',
      ]);
      expect(paths(body({ changes: { settings: [setting({ x: 1 })] } }))).toEqual([
        'changes.settings[0].x',
      ]);
    });

    it('requires the top-level fields', () => {
      expect(paths({})).toEqual(['deviceId', 'deviceName', 'clientNow', 'changes']);
    });

    it('requires the fields of every item', () => {
      expect(paths(body({ changes: { progress: [{}] } }))).toEqual(
        expect.arrayContaining([
          'changes.progress[0].bookId',
          'changes.progress[0].position',
          'changes.progress[0].duration',
          'changes.progress[0].speed',
          'changes.progress[0].finished',
          'changes.progress[0].updatedAt',
        ]),
      );
      expect(paths(body({ changes: { flags: [{}] } }))).toEqual(
        expect.arrayContaining(['changes.flags[0].kind', 'changes.flags[0].addedAt']),
      );
      expect(paths(body({ changes: { history: [{}] } }))).toEqual(
        expect.arrayContaining(['changes.history[0].startedAt', 'changes.history[0].lastPlayedAt']),
      );
      expect(paths(body({ changes: { settings: [{ key: 'theme', updatedAt: T }] } }))).toEqual([
        'changes.settings[0].value',
      ]);
    });

    it('reports the index of the item that is wrong', () => {
      expect(
        paths(body({ changes: { flags: [flag(), flag(), flag({ bookId: 'nope' })] } })),
      ).toEqual(['changes.flags[2].bookId']);
    });

    it('reports every problem of one item, not just the first', () => {
      expect(
        paths(
          body({ changes: { progress: [progress({ position: -1, speed: 9, finished: 'yes' })] } }),
        ),
      ).toEqual([
        'changes.progress[0].position',
        'changes.progress[0].speed',
        'changes.progress[0].finished',
      ]);
    });

    it('items must be objects and lists must be lists', () => {
      expect(paths(body({ changes: { progress: [5] } }))).toEqual(['changes.progress[0]']);
      expect(paths(body({ changes: { progress: {} } }))).toEqual(['changes.progress']);
      expect(paths(body({ changes: [] }))).toEqual(['changes']);
      expect(paths(body({ changes: null }))).toEqual(['changes']);
    });
  });

  describe('values', () => {
    it('deviceId must be a UUID', () => {
      for (const deviceId of ['x', '', 5, null, `${DEVICE}0`]) {
        expect(paths(body({ deviceId }))).toEqual(['deviceId']);
      }
    });

    it('deviceName is text of at most 80 characters', () => {
      expect(parsePushBody(body({ deviceName: 'a'.repeat(MAX_DEVICE_NAME) })).ok).toBe(true);
      expect(parsePushBody(body({ deviceName: '' })).ok).toBe(true);
      expect(paths(body({ deviceName: 'a'.repeat(MAX_DEVICE_NAME + 1) }))).toEqual(['deviceName']);
      expect(paths(body({ deviceName: 5 }))).toEqual(['deviceName']);
    });

    it('clientNow and every time are whole milliseconds in range', () => {
      for (const value of [
        -1,
        1.5,
        '1',
        null,
        Number.NaN,
        MAX_TIME_MS + 1,
        Number.POSITIVE_INFINITY,
      ]) {
        expect(paths(body({ clientNow: value }))).toEqual(['clientNow']);
        expect(paths(body({ changes: { flags: [flag({ updatedAt: value })] } }))).toEqual([
          'changes.flags[0].updatedAt',
        ]);
      }
      expect(parsePushBody(body({ clientNow: 0 })).ok).toBe(true);
      expect(parsePushBody(body({ clientNow: MAX_TIME_MS })).ok).toBe(true);
    });

    it('optional times may be left out or null, but not wrong', () => {
      expect(parsePushBody(body({ changes: { flags: [flag({ deletedAt: null })] } })).ok).toBe(
        true,
      );
      expect(paths(body({ changes: { flags: [flag({ deletedAt: 'x' })] } }))).toEqual([
        'changes.flags[0].deletedAt',
      ]);
      expect(paths(body({ changes: { history: [history({ finishedAt: -5 })] } }))).toEqual([
        'changes.history[0].finishedAt',
      ]);
      expect(paths(body({ changes: { progress: [progress({ dismissedAt: 1.2 })] } }))).toEqual([
        'changes.progress[0].dismissedAt',
      ]);
    });

    it('merge is a boolean when given', () => {
      expect(parsePushBody(body({ merge: false })).ok).toBe(true);
      expect(paths(body({ merge: 'yes' }))).toEqual(['merge']);
    });

    it('position and duration are seconds, not infinite or negative', () => {
      for (const value of [-0.1, Number.NaN, '5', null, 1e12]) {
        expect(paths(body({ changes: { progress: [progress({ position: value })] } }))).toEqual([
          'changes.progress[0].position',
        ]);
        expect(paths(body({ changes: { progress: [progress({ duration: value })] } }))).toEqual([
          'changes.progress[0].duration',
        ]);
      }
      expect(
        parsePushBody(body({ changes: { progress: [progress({ position: 0, duration: 0 })] } })).ok,
      ).toBe(true);
    });

    it('speed stays within the player’s range', () => {
      for (const value of [0, 0.49, 3.01, Number.NaN, '1']) {
        expect(paths(body({ changes: { progress: [progress({ speed: value })] } }))).toEqual([
          'changes.progress[0].speed',
        ]);
      }
      for (const value of [0.5, 1, 3]) {
        expect(
          parsePushBody(body({ changes: { progress: [progress({ speed: value })] } })).ok,
        ).toBe(true);
      }
    });

    it('a flag kind is like or listen_later', () => {
      expect(paths(body({ changes: { flags: [flag({ kind: 'dislike' })] } }))).toEqual([
        'changes.flags[0].kind',
      ]);
      expect(paths(body({ changes: { flags: [flag({ kind: 'listenLater' })] } }))).toEqual([
        'changes.flags[0].kind',
      ]);
    });

    it('a book id must be a UUID', () => {
      expect(paths(body({ changes: { history: [history({ bookId: 'abc' })] } }))).toEqual([
        'changes.history[0].bookId',
      ]);
    });

    it('a setting key is a name of 1 to 64 characters', () => {
      expect(paths(body({ changes: { settings: [setting({ key: '' })] } }))).toEqual([
        'changes.settings[0].key',
      ]);
      expect(paths(body({ changes: { settings: [setting({ key: 'k'.repeat(65) })] } }))).toEqual([
        'changes.settings[0].key',
      ]);
      expect(paths(body({ changes: { settings: [setting({ key: 5 })] } }))).toEqual([
        'changes.settings[0].key',
      ]);
    });
  });

  describe('limits', () => {
    it('accepts 500 items in a list and refuses 501', () => {
      const many = (n: number) => Array.from({ length: n }, () => flag());
      expect(parsePushBody(body({ changes: { flags: many(MAX_ITEMS_PER_LIST) } })).ok).toBe(true);
      expect(issues(body({ changes: { flags: many(MAX_ITEMS_PER_LIST + 1) } }))).toEqual([
        { path: 'changes.flags', message: expect.stringContaining('500') },
      ]);
    });

    it('the limit is per list', () => {
      const many = (make: () => object) => Array.from({ length: MAX_ITEMS_PER_LIST }, make);
      const parsed = parsePushBody(
        body({
          changes: {
            progress: many(progress),
            flags: many(flag),
            history: many(history),
            settings: many(setting),
          },
        }),
      );
      expect(parsed.ok).toBe(true);
    });

    it('reports at most 50 problems', () => {
      const bad = Array.from({ length: 200 }, () => ({}));
      expect(issues(body({ changes: { progress: bad } }))).toHaveLength(MAX_ISSUES);
    });
  });
});

describe('parsePullQuery', () => {
  const parse = (query: string) => parsePullQuery(new URLSearchParams(query));

  it('defaults to everything and no device', () => {
    expect(parse('')).toEqual({ ok: true, value: { since: 0, deviceId: null } });
  });

  it('reads the cursor and the device', () => {
    expect(parse(`since=1234&deviceId=${DEVICE}`)).toEqual({
      ok: true,
      value: { since: 1234, deviceId: DEVICE.toLowerCase() },
    });
  });

  it('refuses a cursor that is not a whole number', () => {
    for (const since of ['-1', '1.5', 'abc', '', '1e3', ' 5', '99999999999999999']) {
      expect(parse(`since=${since}`)).toEqual({
        ok: false,
        errors: [{ path: 'since', message: expect.any(String) }],
      });
    }
  });

  it('refuses a device that is not a UUID', () => {
    expect(parse('deviceId=phone')).toEqual({
      ok: false,
      errors: [{ path: 'deviceId', message: expect.any(String) }],
    });
  });

  it('refuses unknown and repeated parameters', () => {
    expect(parse('limit=5')).toEqual({
      ok: false,
      errors: [{ path: 'limit', message: expect.stringContaining('Unknown') }],
    });
    expect(parse('since=1&since=2')).toEqual({
      ok: false,
      errors: [{ path: 'since', message: expect.stringContaining('more than once') }],
    });
  });
});

describe('readJsonBody', () => {
  const post = (init: RequestInit & { headers?: Record<string, string> }) =>
    new Request('https://app.test/api/sync/push', { method: 'POST', ...init });

  it('reads JSON', async () => {
    const result = await readJsonBody(
      post({ headers: { 'content-type': 'application/json' }, body: '{"a":1}' }),
    );
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it('accepts a charset, any case, and a sendBeacon Blob', async () => {
    const withCharset = await readJsonBody(
      post({ headers: { 'content-type': 'Application/JSON; charset=utf-8' }, body: '[1]' }),
    );
    expect(withCharset).toEqual({ ok: true, body: [1] });
    const blob = await readJsonBody(
      post({ body: new Blob(['{"b":2}'], { type: 'application/json' }) }),
    );
    expect(blob).toEqual({ ok: true, body: { b: 2 } });
  });

  it('refuses any other content type with 415', async () => {
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      '',
    ]) {
      const result = await readJsonBody(post({ headers: { 'content-type': type }, body: '{}' }));
      expect(result).toMatchObject({ ok: false, status: 415, code: 'unsupported_media_type' });
    }
    expect(await readJsonBody(post({}))).toMatchObject({ status: 415 });
  });

  it('refuses a body over 1 MB with 413', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) });
    const result = await readJsonBody(
      post({ headers: { 'content-type': 'application/json' }, body: big }),
    );
    expect(result).toMatchObject({ ok: false, status: 413, code: 'payload_too_large' });
  });

  it('refuses by the declared length before reading', async () => {
    const result = await readJsonBody(
      post({
        headers: {
          'content-type': 'application/json',
          'content-length': String(MAX_BODY_BYTES + 1),
        },
        body: '{}',
      }),
    );
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('stops reading a stream that grows past the limit', async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 256 * 1024;
        controller.enqueue(new Uint8Array(256 * 1024).fill(32));
        if (sent > 50 * 1024 * 1024) controller.close();
      },
    });
    const result = await readJsonBody(
      new Request('https://app.test/api/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: stream,
        duplex: 'half',
      } as RequestInit),
    );
    expect(result).toMatchObject({ ok: false, status: 413 });
    expect(sent).toBeLessThan(5 * 1024 * 1024);
  });

  it('accepts a body of exactly 1 MB', async () => {
    const pad = 'x'.repeat(MAX_BODY_BYTES - '{"p":""}'.length);
    const result = await readJsonBody(
      post({ headers: { 'content-type': 'application/json' }, body: `{"p":"${pad}"}` }),
    );
    expect(result.ok).toBe(true);
  });

  it('counts bytes, not characters', async () => {
    const pad = 'я'.repeat(MAX_BODY_BYTES / 2);
    const result = await readJsonBody(
      post({ headers: { 'content-type': 'application/json' }, body: `{"p":"${pad}"}` }),
    );
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it('refuses malformed JSON, an empty body and invalid UTF-8 with 400', async () => {
    for (const bad of ['{', '', 'undefined', '{"a":1}}']) {
      const result = await readJsonBody(
        post({ headers: { 'content-type': 'application/json' }, body: bad }),
      );
      expect(result).toMatchObject({ ok: false, status: 400, code: 'invalid_json' });
    }
    const bytes = new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]);
    const invalid = await readJsonBody(
      post({ headers: { 'content-type': 'application/json' }, body: bytes }),
    );
    expect(invalid).toMatchObject({ ok: false, status: 400 });
  });
});
