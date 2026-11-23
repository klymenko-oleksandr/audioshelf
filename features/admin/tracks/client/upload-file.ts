import type { TrackActionResult, TracksSnapshot } from '../action-types';
import { checkAudioFile } from '../file-check';
import { sha256Hex } from '@/lib/hash/stream-sha256';
import { readAudioDuration } from './read-duration';
import { putFile } from './put-file';

export type Phase = 'reading' | 'fingerprint' | 'sending' | 'checking';

/** The server actions the upload talks to (passed in so the flow can be tested without them). */
export interface UploadApi {
  start(input: {
    file: { name: string; type: string; size: number };
    hash: string;
    durationSeconds: number;
  }): Promise<TrackActionResult>;
  restart(
    trackId: string,
    input: {
      file: { name: string; type: string; size: number };
      hash: string;
      durationSeconds: number;
    },
  ): Promise<TrackActionResult>;
  fail(trackId: string, reason: string): Promise<TrackActionResult>;
  complete(trackId: string): Promise<TrackActionResult>;
}

export type UploadOutcome =
  | { kind: 'rejected'; reason: string }
  | { kind: 'refused'; message: string; snapshot?: TracksSnapshot }
  | { kind: 'done'; snapshot: TracksSnapshot; trackId: string | null; message?: string };

/**
 * One file, start to finish: check it, read its length, fingerprint it, ask the server for a
 * one-time address, send it, then ask the server to check it in storage. `onSnapshot` is called
 * whenever the server answers with the new state of the list.
 */
export async function uploadFile(options: {
  file: File;
  api: UploadApi;
  /** Set when retrying a failed part: it keeps its place and title. */
  retryTrackId?: string;
  onPhase(phase: Phase, fraction: number, trackId: string | null): void;
  onSnapshot(snapshot: TracksSnapshot): void;
}): Promise<UploadOutcome> {
  const { file, api, retryTrackId, onPhase, onSnapshot } = options;
  const checked = checkAudioFile(file);
  if (!checked.ok) return { kind: 'rejected', reason: checked.reason };

  let trackId: string | null = retryTrackId ?? null;
  onPhase('reading', 0, trackId);
  let durationSeconds: number;
  try {
    durationSeconds = await readAudioDuration(file);
  } catch (error) {
    return {
      kind: 'rejected',
      reason: error instanceof Error ? error.message : 'Unreadable file.',
    };
  }

  onPhase('fingerprint', 0, trackId);
  const hash = await sha256Hex(file, {
    onProgress: (done) => onPhase('fingerprint', done / file.size, trackId),
  });

  const input = {
    file: { name: file.name, type: file.type, size: file.size },
    hash,
    durationSeconds,
  };
  const begun = retryTrackId ? await api.restart(retryTrackId, input) : await api.start(input);
  if (!begun.ok) {
    if (begun.snapshot) onSnapshot(begun.snapshot);
    return { kind: 'refused', message: begun.message, snapshot: begun.snapshot };
  }
  onSnapshot(begun.snapshot);
  trackId = begun.trackId ?? trackId;
  if (!trackId || !begun.upload) {
    return { kind: 'refused', message: 'The server did not return an upload address.' };
  }

  try {
    await putFile({
      url: begun.upload.url,
      headers: begun.upload.headers,
      file,
      onProgress: (fraction) => onPhase('sending', fraction, trackId),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The upload failed.';
    const failed = await api.fail(trackId, reason);
    if (failed.ok) onSnapshot(failed.snapshot);
    else if (failed.snapshot) onSnapshot(failed.snapshot);
    return {
      kind: 'done',
      snapshot: failed.ok ? failed.snapshot : (failed.snapshot ?? begun.snapshot),
      trackId,
      message: reason,
    };
  }

  onPhase('checking', 1, trackId);
  const completed = await api.complete(trackId);
  if (completed.snapshot) onSnapshot(completed.snapshot);
  return completed.ok
    ? { kind: 'done', snapshot: completed.snapshot, trackId }
    : {
        kind: 'done',
        snapshot: completed.snapshot ?? begun.snapshot,
        trackId,
        message: completed.message,
      };
}
