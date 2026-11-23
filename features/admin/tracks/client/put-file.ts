import { UploadCancelled } from './cancelled';

/**
 * Sends a blob straight from the browser to storage with a one-time address. A plain XHR:
 * `fetch` cannot report upload progress. Resolves with the ETag storage answered with (empty
 * when the bucket's CORS rules do not expose it); rejects with `UploadCancelled` on abort.
 */
export function putBlob(options: {
  url: string;
  headers?: Record<string, string>;
  body: Blob;
  signal?: AbortSignal;
  /** Bytes of the body sent so far. */
  onProgress?: (sentBytes: number) => void;
}): Promise<{ etag: string }> {
  const { url, headers = {}, body, signal, onProgress } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelled());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(body.size);
        resolve({ etag: xhr.getResponseHeader('ETag') ?? '' });
      } else {
        reject(new Error(`Storage refused the file (status ${xhr.status}).`));
      }
    };
    xhr.onerror = () => {
      done();
      reject(new Error('The connection to storage failed while sending.'));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadCancelled());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });
}

/** One file in one request (up to 100 MB), reporting progress as a fraction (0 to 1). */
export async function putFile(options: {
  url: string;
  headers: Record<string, string>;
  file: Blob;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const { file, onProgress, ...rest } = options;
  await putBlob({
    ...rest,
    body: file,
    onProgress: (sent) => onProgress?.(file.size > 0 ? sent / file.size : 1),
  });
}
