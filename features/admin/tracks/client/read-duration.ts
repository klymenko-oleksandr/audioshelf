/**
 * The length of an audio file in whole seconds, read by the browser from the file itself
 * (nothing is uploaded). Rejects when the file cannot be decoded or says it has no length.
 */
export function readAudioDuration(file: Blob, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error('Reading the length took too long.'))),
      timeoutMs,
    );
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      if (Number.isFinite(seconds) && seconds > 0) {
        finish(() => resolve(Math.max(1, Math.round(seconds))));
      } else {
        finish(() => reject(new Error('The file does not say how long it is.')));
      }
    };
    audio.onerror = () =>
      finish(() => reject(new Error('The browser cannot read this audio file.')));
    audio.src = url;
  });
}
