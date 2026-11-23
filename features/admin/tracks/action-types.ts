import type { ChapterItem, TrackItem } from './data';

export interface TracksSnapshot {
  tracks: TrackItem[];
  chapters: ChapterItem[];
}

export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

/** A big file is sent in parts: the browser asks for the part addresses, then joins them. */
export interface MultipartTarget {
  uploadId: string;
  partSize: number;
  partCount: number;
}

/** What every track action answers with: the new state of the list, so the card never guesses. */
export type TrackActionResult =
  | {
      ok: true;
      snapshot: TracksSnapshot;
      trackId?: string;
      upload?: UploadTarget;
      multipart?: MultipartTarget;
    }
  | { ok: false; message: string; snapshot?: TracksSnapshot };

/** One address per part, in part order. */
export type PartUrlsResult = { ok: true; urls: string[] } | { ok: false; message: string };
