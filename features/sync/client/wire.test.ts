// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OutboxRecord } from '@/lib/local-db/types';
import { MAX_BODY_BYTES, parsePushBody } from '../request';
import { deviceName, toBatches } from './wire';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const like = (n: number, merge = false): OutboxRecord => ({
  owner: 'a',
  key: `flag:${id(n)}:like`,
  kind: 'flag',
  merge,
  version: `v${n}`,
  item: { bookId: id(n), kind: 'like', addedAt: 1, deletedAt: null, updatedAt: 1 },
});

describe('toBatches', () => {
  it('sends at most 500 of a list per request', () => {
    const batches = toBatches(Array.from({ length: 1201 }, (_, n) => like(n)));
    expect(batches.map((b) => b.changes.flags.length)).toEqual([500, 500, 201]);
    expect(batches.flatMap((b) => b.entries)).toHaveLength(1201);
  });

  it('puts merge rows in requests of their own, first', () => {
    const batches = toBatches([like(1), like(2, true), like(3)]);
    expect(batches.map((b) => [b.merge, b.entries.length])).toEqual([
      [true, 1],
      [false, 2],
    ]);
  });

  it('keeps each request under the byte limit', () => {
    const batches = toBatches(
      Array.from({ length: 100 }, (_, n) => like(n)),
      { bytes: 2000 },
    );
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      expect(JSON.stringify(batch.changes).length).toBeLessThan(2200);
    }
  });

  it('builds bodies the server accepts', () => {
    const [batch] = toBatches(Array.from({ length: 500 }, (_, n) => like(n)));
    const body = { deviceId: id(1), deviceName: 'x', clientNow: 1, changes: batch!.changes };
    expect(parsePushBody(body).ok).toBe(true);
    expect(JSON.stringify(body).length).toBeLessThan(MAX_BODY_BYTES);
  });

  it('is empty for an empty outbox', () => {
    expect(toBatches([])).toEqual([]);
  });
});

describe('deviceName', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0', 'Firefox on Linux'],
    ['', 'Web browser'],
  ])('%s', (ua, name) => {
    expect(deviceName(ua)).toBe(name);
  });
});
