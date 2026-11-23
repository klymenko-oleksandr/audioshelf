/**
 * Sends a file straight from the browser to storage with a one-time address, reporting
 * progress as a fraction (0 to 1). A plain XHR: `fetch` cannot report upload progress.
 */
export function putFile(options: {
  url: string;
  headers: Record<string, string>;
  file: Blob;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const { url, headers, file, onProgress } = options;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`Storage refused the file (status ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('The connection to storage failed while sending.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));
    xhr.send(file);
  });
}
