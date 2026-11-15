/**
 * What the player needs to know about a book (PRD: Player → Model).
 *
 * A book has ordered tracks (audio files) and ordered chapters (titled ranges of book time).
 * Usually one chapter per track, but a chapter may span or split tracks. The UI shows chapters
 * only; tracks are an implementation detail.
 *
 * All times are seconds. "Book time" counts from the start of the book across all tracks.
 */
export interface PlayerTrack {
  id: string;
  url: string;
  /** Length of the file in seconds. */
  duration: number;
}

export interface PlayerChapter {
  id: string;
  title: string;
  /** Book time where the chapter starts (inclusive). */
  start: number;
  /** Book time where the chapter ends (exclusive, except for the last chapter). */
  end: number;
}

export interface PlayerBook {
  id: string;
  slug: string;
  title: string;
  author: string;
  coverUrl?: string;
  tracks: PlayerTrack[];
  chapters: PlayerChapter[];
  /** Published before all parts are out: reaching the end means "up to date", not "finished". */
  ongoing: boolean;
}
