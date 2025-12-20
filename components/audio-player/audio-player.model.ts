import { Book } from '@/lib/types';

export type AudioPlayerState = {
  currentBook: Book | null;
  currentChapterId: string | null;
  currentChapterInitialPosition: number;
  isPlaying: boolean;
};

export type AudioPlayerAction =
  | { type: 'PLAY_BOOK'; payload: { book: Book; chapterId: string; initialPosition: number } }
  | { type: 'PLAY_CHAPTER'; payload: { book: Book; chapterId: string } }
  | { type: 'TOGGLE_PLAY_PAUSE' }
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'CLOSE_PLAYER' };
