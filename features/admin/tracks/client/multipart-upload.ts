import type { PartUrlsResult, TrackActionResult } from '../action-types';
import { overallFraction, splitIntoParts, type CompletedPart, type PartRange } from '../multipart';
import { UploadCancelled } from './cancelled';
import { putBlob } from './put-file';

export { UploadCancelled };

export interface PartPutArgs {
  url: string;
  body: Blob;
  signal: AbortSignal;
  /** Bytes of this part sent so far. */
  onProgress: (sentBytes: number) => void;
}
export type PartPutter = (args: PartPutArgs) => Promise<{ etag: string }>;

/** The real thing: one XHR per part. Parts carry no headers; the address is signed without any. */
export const putPartToStorage: PartPutter = ({ url, body, signal, onProgress }) =>
  putBlob({ url, body, signal, onProgress });

/** Not worth retrying: sending the same part again will not make storage hand back an ETag. */
class MissingEtag extends Error {
  constructor() {
    super(
      'Storage did not return an ETag for a part. The bucket CORS rule for PUT must expose the ETag header.',
    );
    this.name = 'MissingEtag';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface UploadPartsOptions {
  file: Blob;
  parts: PartRange[];
  /** One address per part; the address of part N is `urls[N - 1]`. */
  urls: string[];
  putPart: PartPutter;
  concurrency?: number;
  /** Tries per part before the whole upload gives up. */
  maxAttempts?: number;
  /** Wait before try number `attempt + 1`, in ms. */
  retryDelayMs?: (attempt: number) => number;
  signal?: AbortSignal;
  /** Overall fraction sent, 0 to 1. */
  onProgress?: (fraction: number) => void;
}

/**
 * Sends the parts of a file, a few at a time, each retried on its own. Resolves with every
 * part's ETag in part order. Rejects with `UploadCancelled` when `signal` aborts, or with the
 * error of the first part that ran out of tries (the others still in flight are aborted).
 */
export async function uploadParts(options: UploadPartsOptions): Promise<CompletedPart[]> {
  const {
    file,
    parts,
    urls,
    putPart,
    concurrency = 3,
    maxAttempts = 3,
    retryDelayMs = (attempt) => 1000 * attempt,
    signal: outer,
    onProgress,
  } = options;

  if (outer?.aborted) throw new UploadCancelled();

  const inner = new AbortController();
  const stop = () => inner.abort();
  outer?.addEventListener('abort', stop, { once: true });

  const sizes = parts.map((p) => p.size);
  const sent = parts.map(() => 0);
  const report = () => onProgress?.(overallFraction(sizes, sent));
  report();

  const etags = new Map<number, string>();
  let failure: unknown;
  let next = 0;

  const isCancel = (error: unknown) => error instanceof UploadCancelled || inner.signal.aborted;

  async function sendPart(index: number) {
    const part = parts[index]!;
    for (let attempt = 1; ; attempt++) {
      try {
        const { etag } = await putPart({
          url: urls[index]!,
          body: file.slice(part.start, part.end),
          signal: inner.signal,
          onProgress: (bytes) => {
            sent[index] = bytes;
            report();
          },
        });
        if (!etag.trim()) throw new MissingEtag();
        sent[index] = part.size;
        report();
        etags.set(part.partNumber, etag);
        return;
      } catch (error) {
        if (isCancel(error) || error instanceof MissingEtag || attempt >= maxAttempts) throw error;
        sent[index] = 0;
        report();
        await sleep(retryDelayMs(attempt));
        if (inner.signal.aborted) throw new UploadCancelled();
      }
    }
  }

  async function worker() {
    while (!inner.signal.aborted) {
      const index = next++;
      if (index >= parts.length) return;
      try {
        await sendPart(index);
      } catch (error) {
        if (!isCancel(error) || failure === undefined) {
          // Remember the first real failure; the aborts it causes in other workers are not news.
          if (!(error instanceof UploadCancelled)) failure ??= error;
        }
        inner.abort();
        return;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, parts.length) }, worker));
  } finally {
    outer?.removeEventListener('abort', stop);
  }

  if (failure !== undefined) throw failure;
  if (outer?.aborted || etags.size !== parts.length) throw new UploadCancelled();
  return parts.map((p) => ({ partNumber: p.partNumber, etag: etags.get(p.partNumber)! }));
}

/** The server actions the multipart steps talk to (passed in so the flow can be tested). */
export interface SendApi {
  partUrls(trackId: string, uploadId: string): Promise<PartUrlsResult>;
  completeMultipart(
    trackId: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<TrackActionResult>;
  abortMultipart(trackId: string, uploadId: string, reason: string): Promise<TrackActionResult>;
}

export type SendOutcome =
  | { kind: 'completed'; result: TrackActionResult }
  | { kind: 'failed'; message: string; result?: TrackActionResult }
  | { kind: 'cancelled'; result?: TrackActionResult };

/**
 * A big file, start to finish after the server has opened the multipart upload: get the part
 * addresses, send the parts, ask the server to join them. If anything goes wrong, or the admin
 * cancels, the multipart upload is aborted so storage keeps no half-sent parts.
 */
export async function sendInParts(
  options: {
    file: Blob;
    trackId: string;
    multipart: { uploadId: string; partSize: number; partCount: number };
    api: SendApi;
    putPart?: PartPutter;
  } & Pick<
    UploadPartsOptions,
    'signal' | 'onProgress' | 'concurrency' | 'maxAttempts' | 'retryDelayMs'
  >,
): Promise<SendOutcome> {
  const { file, trackId, multipart, api, putPart = putPartToStorage, ...rest } = options;
  const { uploadId } = multipart;

  const abort = async (reason: string) => {
    try {
      return await api.abortMultipart(trackId, uploadId, reason);
    } catch (error) {
      console.error('Aborting the multipart upload failed', error);
      return undefined;
    }
  };

  let parts: CompletedPart[];
  try {
    const ranges = splitIntoParts(file.size, multipart.partSize);
    if (ranges.length !== multipart.partCount) {
      throw new Error('The server and the browser disagree about how many parts to send.');
    }
    const addresses = await api.partUrls(trackId, uploadId);
    if (!addresses.ok) throw new Error(addresses.message);
    if (addresses.urls.length !== ranges.length) {
      throw new Error('The server returned the wrong number of part addresses.');
    }
    parts = await uploadParts({ file, parts: ranges, urls: addresses.urls, putPart, ...rest });
  } catch (error) {
    if (error instanceof UploadCancelled || rest.signal?.aborted) {
      return { kind: 'cancelled', result: await abort('Upload cancelled.') };
    }
    const message = error instanceof Error ? error.message : 'The upload failed.';
    return { kind: 'failed', message, result: await abort(message) };
  }

  try {
    return { kind: 'completed', result: await api.completeMultipart(trackId, uploadId, parts) };
  } catch (error) {
    console.error('Completing the multipart upload failed', error);
    const message = 'The connection failed while finishing the upload. Try again.';
    return { kind: 'failed', message, result: await abort(message) };
  }
}
