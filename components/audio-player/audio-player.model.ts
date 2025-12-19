import { Book } from '@/lib/types';

export type AudioPlayerState = {
  currentBook: Book | null;
  currentChapterId: string | null;
  isPlaying: boolean;
};

export type AudioPlayerAction =
  | { type: 'PLAY_BOOK'; payload: { book: Book; chapterId?: string } }
  | { type: 'PLAY_CHAPTER'; payload: string }
  | { type: 'TOGGLE_PLAY_PAUSE' }
  | { type: 'CLOSE_PLAYER' }
  | { type: 'SET_PLAYING'; payload: boolean };
