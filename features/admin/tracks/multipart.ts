/**
 * Multipart upload maths (ADR 3, Phase 4c-2). Files up to 100 MB go in one request; bigger ones
 * (up to 500 MB) are cut into parts that the browser sends to storage separately, then joined.
 * Everything here is pure, so the rules can be tested without storage or a browser.
 */

const MB = 1024 * 1024;

/** Up to this size a file is sent in one request (the 4c-1 path). */
export const SINGLE_PUT_MAX_BYTES = 100 * MB;

/** Storage refuses a part below 5 MiB unless it is the last one. */
export const MIN_PART_BYTES = 5 * MB;

/** Storage allows at most 10,000 parts per upload. */
export const MAX_PARTS = 10_000;

/** 16 MiB: a 500 MB file is 32 parts, so one failed part costs little to repeat. */
export const PART_SIZE_BYTES = 16 * MB;

export const needsMultipart = (sizeBytes: number) => sizeBytes > SINGLE_PUT_MAX_BYTES;

export interface PartRange {
  /** Starts at 1, as storage numbers parts. */
  partNumber: number;
  /** Byte range in the file: `start` included, `end` excluded (what `Blob.slice` takes). */
  start: number;
  end: number;
  size: number;
}

function checkSplit(sizeBytes: number, partSize: number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`Invalid file size: ${sizeBytes}`);
  }
  if (!Number.isSafeInteger(partSize) || partSize < MIN_PART_BYTES) {
    throw new Error(`A part must be at least ${MIN_PART_BYTES} bytes, not ${partSize}.`);
  }
  if (Math.ceil(sizeBytes / partSize) > MAX_PARTS) {
    throw new Error(`The file would need more than ${MAX_PARTS} parts.`);
  }
}

export function partCount(sizeBytes: number, partSize = PART_SIZE_BYTES): number {
  checkSplit(sizeBytes, partSize);
  return Math.ceil(sizeBytes / partSize);
}

/** Cuts a file of `sizeBytes` into equal parts; only the last may be shorter. */
export function splitIntoParts(sizeBytes: number, partSize = PART_SIZE_BYTES): PartRange[] {
  const count = partCount(sizeBytes, partSize);
  return Array.from({ length: count }, (_, index) => {
    const start = index * partSize;
    const end = Math.min(start + partSize, sizeBytes);
    return { partNumber: index + 1, start, end, size: end - start };
  });
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export type PartsCheck = { ok: true; parts: CompletedPart[] } | { ok: false; reason: string };

/**
 * What the browser says it sent must be exactly parts 1..N, once each, each with an ETag.
 * Returned in part order, which is the order storage needs them in.
 */
export function validateCompletedParts(parts: CompletedPart[], expectedCount: number): PartsCheck {
  if (parts.length !== expectedCount) {
    return { ok: false, reason: `Expected ${expectedCount} parts but got ${parts.length}.` };
  }
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  for (const [index, part] of sorted.entries()) {
    if (!Number.isInteger(part.partNumber) || part.partNumber !== index + 1) {
      return {
        ok: false,
        reason: `Part ${part.partNumber} is missing, duplicated or out of range.`,
      };
    }
    if (typeof part.etag !== 'string' || part.etag.trim() === '') {
      return { ok: false, reason: `Part ${part.partNumber} has no ETag.` };
    }
  }
  return { ok: true, parts: sorted };
}

/** Overall progress from the bytes each part has sent so far, weighted by the part's size. */
export function overallFraction(partSizes: number[], sentBytes: number[]): number {
  const total = partSizes.reduce((sum, size) => sum + size, 0);
  if (total <= 0) return 0;
  const sent = partSizes.reduce(
    (sum, size, index) => sum + Math.min(size, Math.max(0, sentBytes[index] ?? 0)),
    0,
  );
  return sent / total;
}
