import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './stream-sha256';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('sha256Hex', () => {
  it('matches the reference SHA-256 for a small file', async () => {
    const bytes = new TextEncoder().encode('hello audiobook');
    expect(await sha256Hex(new Blob([bytes as BlobPart]))).toBe(sha(bytes));
  });

  it('matches for an empty file', async () => {
    expect(await sha256Hex(new Blob([]))).toBe(sha(new Uint8Array()));
  });

  it('reads in chunks and still matches, with a size that is not a multiple of the chunk', async () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 251;
    const seen: number[] = [];
    const hex = await sha256Hex(new Blob([bytes as BlobPart]), {
      chunkSize: 300,
      onProgress: (done) => seen.push(done),
    });
    expect(hex).toBe(sha(bytes));
    expect(seen).toEqual([300, 600, 900, 1000]);
  });
});
