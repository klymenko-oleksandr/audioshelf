import type { ChapterItem, TrackItem } from './data';

export interface TracksSnapshot {
  tracks: TrackItem[];
  chapters: ChapterItem[];
}

export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

/** What every track action answers with: the new state of the list, so the card never guesses. */
export type TrackActionResult =
  | { ok: true; snapshot: TracksSnapshot; trackId?: string; upload?: UploadTarget }
  | { ok: false; message: string; snapshot?: TracksSnapshot };
