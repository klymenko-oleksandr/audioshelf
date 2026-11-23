import { describe, expect, it, vi } from 'vitest';
import type { TrackActionResult } from '../action-types';
import { splitIntoParts } from '../multipart';
import {
  UploadCancelled,
  sendInParts,
  uploadParts,
  type PartPutter,
  type SendApi,
} from './multipart-upload';

const MB = 1024 * 1024;
const PART = 5 * MB;
const blob = (size: number) => new Blob([new Uint8Array(size)]);
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://r2.test/part-${i + 1}`);
const noDelay = () => 0;

/** A storage stand-in: answers every part with an ETag made from its number. */
const okPutter = (log: { number: number; size: number }[] = []): PartPutter =>
  vi.fn(async ({ url, body, onProgress }) => {
    const number = Number(url.split('-').pop());
    log.push({ number, size: body.size });
    onProgress(body.size);
    return { etag: `"etag-${number}"` };
  });

describe('uploadParts', () => {
  it('sends each part its own slice of the file and returns the ETags in part order', async () => {
    const file = blob(12 * MB); // 5 + 5 + 2
    const log: { number: number; size: number }[] = [];
    const parts = await uploadParts({
      file,
      parts: splitIntoParts(file.size, PART),
      urls: urls(3),
      putPart: okPutter(log),
      retryDelayMs: noDelay,
    });
    expect(parts).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    expect(log.sort((a, b) => a.number - b.number).map((x) => x.size)).toEqual([
      PART,
      PART,
      2 * MB,
    ]);
  });

  it('never has more parts in flight than the concurrency allows, and still sends them all', async () => {
    const file = blob(30 * MB);
    let inFlight = 0;
    let peak = 0;
    const putPart: PartPutter = async ({ url, body, onProgress }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      onProgress(body.size);
      inFlight--;
      return { etag: `"${url}"` };
    };
    const result = await uploadParts({
      file,
      parts: splitIntoParts(file.size, PART),
      urls: urls(6),
      putPart,
      concurrency: 2,
      retryDelayMs: noDelay,
    });
    expect(result).toHaveLength(6);
    expect(peak).toBe(2);
  });

  it('reports the overall fraction, weighted by size, ending at exactly 1', async () => {
    const file = blob(10 * MB);
    const seen: number[] = [];
    await uploadParts({
      file,
      parts: splitIntoParts(file.size, PART),
      urls: urls(2),
      putPart: okPutter(),
      concurrency: 1,
      retryDelayMs: noDelay,
      onProgress: (f) => seen.push(f),
    });
    expect(seen.at(-1)).toBe(1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(seen).toContain(0.5);
  });

  it('retries a part that fails and takes the progress of the failed try back', async () => {
    const file = blob(10 * MB);
    const attempts = new Map<number, number>();
    const seen: number[] = [];
    const putPart: PartPutter = async ({ url, body, onProgress }) => {
      const number = Number(url.split('-').pop());
      const attempt = (attempts.get(number) ?? 0) + 1;
      attempts.set(number, attempt);
      if (number === 1 && attempt < 3) {
        onProgress(body.size / 2);
        throw new Error('connection reset');
      }
      onProgress(body.size);
      return { etag: `"e${number}"` };
    };
    const parts = await uploadParts({
      file,
      parts: splitIntoParts(file.size, PART),
      urls: urls(2),
      putPart,
      concurrency: 1,
      maxAttempts: 3,
      retryDelayMs: noDelay,
      onProgress: (f) => seen.push(f),
    });
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(attempts.get(1)).toBe(3);
    // After the half-sent first try the fraction went back down to 0 before the next try began.
    const afterHalf = seen.slice(seen.indexOf(0.25));
    expect(afterHalf).toContain(0);
  });

  it('gives up after the attempts are used up, with the reason, and sends no further parts', async () => {
    const file = blob(20 * MB); // 4 parts
    const calls: number[] = [];
    const putPart: PartPutter = async ({ url }) => {
      calls.push(Number(url.split('-').pop()));
      throw new Error('Storage refused the file (status 500).');
    };
    await expect(
      uploadParts({
        file,
        parts: splitIntoParts(file.size, PART),
        urls: urls(4),
        putPart,
        concurrency: 1,
        maxAttempts: 3,
        retryDelayMs: noDelay,
      }),
    ).rejects.toThrow('Storage refused the file (status 500).');
    expect(calls).toEqual([1, 1, 1]);
  });

  it('aborts the parts still in flight when one part gives up', async () => {
    const file = blob(15 * MB);
    const aborted: number[] = [];
    const putPart: PartPutter = async ({ url, signal }) => {
      const number = Number(url.split('-').pop());
      if (number === 1) throw new Error('boom');
      await new Promise<void>((_, reject) =>
        signal.addEventListener('abort', () => {
          aborted.push(number);
          reject(new UploadCancelled());
        }),
      );
      return { etag: 'x' };
    };
    await expect(
      uploadParts({
        file,
        parts: splitIntoParts(file.size, PART),
        urls: urls(3),
        putPart,
        concurrency: 3,
        maxAttempts: 1,
        retryDelayMs: noDelay,
      }),
    ).rejects.toThrow('boom');
    expect(aborted.sort()).toEqual([2, 3]);
  });

  it('stops with UploadCancelled when the signal is aborted, and does not retry or start more parts', async () => {
    const file = blob(20 * MB);
    const controller = new AbortController();
    const started: number[] = [];
    const putPart: PartPutter = async ({ url, signal }) => {
      started.push(Number(url.split('-').pop()));
      controller.abort();
      if (signal.aborted) throw new UploadCancelled(); // what the real sender does first
      await new Promise<void>((_, reject) =>
        signal.addEventListener('abort', () => reject(new UploadCancelled())),
      );
      return { etag: 'x' };
    };
    await expect(
      uploadParts({
        file,
        parts: splitIntoParts(file.size, PART),
        urls: urls(4),
        putPart,
        concurrency: 1,
        maxAttempts: 3,
        retryDelayMs: noDelay,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(UploadCancelled);
    expect(started).toEqual([1]);
  });

  it('does not start at all when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const putPart = vi.fn();
    await expect(
      uploadParts({
        file: blob(6 * MB),
        parts: splitIntoParts(6 * MB, PART),
        urls: urls(2),
        putPart,
        signal: controller.signal,
        retryDelayMs: noDelay,
      }),
    ).rejects.toBeInstanceOf(UploadCancelled);
    expect(putPart).not.toHaveBeenCalled();
  });

  it('fails at once, without retrying, when storage does not hand back an ETag (CORS not exposing it)', async () => {
    const putPart = vi.fn(async () => ({ etag: '' }));
    await expect(
      uploadParts({
        file: blob(4 * MB),
        parts: splitIntoParts(4 * MB, PART),
        urls: urls(1),
        putPart,
        retryDelayMs: noDelay,
      }),
    ).rejects.toThrow(/ETag/);
    expect(putPart).toHaveBeenCalledTimes(1);
  });
});

describe('sendInParts', () => {
  const snapshot = { tracks: [], chapters: [] };
  const done: TrackActionResult = { ok: true, snapshot };
  const multipart = { uploadId: 'up-1', partSize: PART, partCount: 3 };

  function api(overrides: Partial<SendApi> = {}): SendApi {
    return {
      partUrls: vi.fn(async () => ({ ok: true as const, urls: urls(3) })),
      completeMultipart: vi.fn(async () => done),
      abortMultipart: vi.fn(async () => done),
      ...overrides,
    };
  }
  const base = (a: SendApi, extra: Partial<Parameters<typeof sendInParts>[0]> = {}) =>
    sendInParts({
      file: blob(12 * MB),
      trackId: 't1',
      multipart,
      api: a,
      putPart: okPutter(),
      retryDelayMs: noDelay,
      onProgress: () => {},
      ...extra,
    });

  it('asks for the part addresses once, sends the parts, then completes with the collected ETags', async () => {
    const a = api();
    const outcome = await base(a);
    expect(outcome).toEqual({ kind: 'completed', result: done });
    expect(a.partUrls).toHaveBeenCalledTimes(1);
    expect(a.partUrls).toHaveBeenCalledWith('t1', 'up-1');
    expect(a.completeMultipart).toHaveBeenCalledWith('t1', 'up-1', [
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
    expect(a.abortMultipart).not.toHaveBeenCalled();
  });

  it('aborts the multipart upload and does not complete when a part fails for good', async () => {
    const a = api();
    const putPart: PartPutter = async () => {
      throw new Error('The connection to storage failed while sending.');
    };
    const outcome = await base(a, { putPart, maxAttempts: 2 });
    expect(outcome).toMatchObject({
      kind: 'failed',
      message: 'The connection to storage failed while sending.',
    });
    expect(a.abortMultipart).toHaveBeenCalledTimes(1);
    expect(a.abortMultipart).toHaveBeenCalledWith(
      't1',
      'up-1',
      'The connection to storage failed while sending.',
    );
    expect(a.completeMultipart).not.toHaveBeenCalled();
  });

  it('aborts it when the admin cancels, and reports it as cancelled rather than failed', async () => {
    const a = api();
    const controller = new AbortController();
    const putPart: PartPutter = async ({ signal }) => {
      controller.abort();
      if (signal.aborted) throw new UploadCancelled(); // what the real sender does first
      return { etag: 'x' };
    };
    const outcome = await base(a, { putPart, signal: controller.signal });
    expect(outcome).toMatchObject({ kind: 'cancelled' });
    expect(a.abortMultipart).toHaveBeenCalledWith('t1', 'up-1', 'Upload cancelled.');
    expect(a.completeMultipart).not.toHaveBeenCalled();
  });

  it("aborts it when the part addresses cannot be had, with the server's reason", async () => {
    const a = api({
      partUrls: vi.fn(async () => ({
        ok: false as const,
        message: 'Your admin session has ended.',
      })),
    });
    const outcome = await base(a);
    expect(outcome).toMatchObject({ kind: 'failed', message: 'Your admin session has ended.' });
    expect(a.abortMultipart).toHaveBeenCalledWith('t1', 'up-1', 'Your admin session has ended.');
  });

  it("aborts it when the server's part count does not match the file, instead of sending a broken upload", async () => {
    const a = api();
    const outcome = await base(a, { multipart: { ...multipart, partCount: 9 } });
    expect(outcome.kind).toBe('failed');
    expect(a.abortMultipart).toHaveBeenCalledTimes(1);
    expect(a.completeMultipart).not.toHaveBeenCalled();
  });

  it('passes a refusal from the completing step straight back (the server has already cleaned up), without a second abort', async () => {
    const refusal: TrackActionResult = {
      ok: false,
      message: 'The stored file is 1 bytes.',
      snapshot,
    };
    const a = api({ completeMultipart: vi.fn(async () => refusal) });
    const outcome = await base(a);
    expect(outcome).toEqual({ kind: 'completed', result: refusal });
    expect(a.abortMultipart).not.toHaveBeenCalled();
  });

  it('aborts it when the completing request itself throws (network lost), and fails with a message', async () => {
    const a = api({
      completeMultipart: vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    });
    const outcome = await base(a);
    expect(outcome.kind).toBe('failed');
    expect(a.abortMultipart).toHaveBeenCalledTimes(1);
  });

  it('still reports the failure when the abort request itself fails', async () => {
    const a = api({
      abortMultipart: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    const putPart: PartPutter = async () => {
      throw new Error('nope');
    };
    const outcome = await base(a, { putPart, maxAttempts: 1 });
    expect(outcome).toMatchObject({ kind: 'failed', message: 'nope' });
  });
});
