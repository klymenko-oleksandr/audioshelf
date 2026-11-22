import { createSHA256 } from 'hash-wasm';

const DEFAULT_CHUNK = 8 * 1024 * 1024;

/**
 * SHA-256 of a file, read a slice at a time so a 100 MB file never sits in memory whole
 * (ADR 1: the object key carries the first 8 characters of this hash).
 */
export async function sha256Hex(
  file: Blob,
  options: { chunkSize?: number; onProgress?: (bytesDone: number) => void } = {},
): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK;
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, file.size);
    hasher.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    options.onProgress?.(end);
  }
  return hasher.digest('hex');
}
