"use client";

import { createContext, ReactNode, useCallback, useContext, useReducer } from 'react';
import { Book } from '@/lib/types';
import audioPlayerReducer from './audio-player/audioPlayerReducer';
import { AudioPlayerState } from './audio-player/audio-player.model';

interface AudioPlayerContextType {
  currentBook: Book | null;
  currentChapterId: string | null;
  isPlaying: boolean;
  playBook: (book: Book, chapterId?: string) => void;
  playChapter: (chapterId: string) => void;
  togglePlayPause: () => void;
  closePlayer: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentChapterId: (chapterId: string | null) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

const initialState: AudioPlayerState = {
  currentBook: null,
  currentChapterId: null,
  isPlaying: false,
};

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(audioPlayerReducer, initialState);
  const { currentBook, currentChapterId, isPlaying } = state;

  const playBook = useCallback((book: Book, chapterId?: string) => {
    dispatch({ type: 'PLAY_BOOK', payload: { book, chapterId } });
  }, []);

  const playChapter = useCallback((chapterId: string) => {
    dispatch({ type: 'PLAY_CHAPTER', payload: chapterId });
  }, []);

  const togglePlayPause = useCallback(() => {
    dispatch({ type: 'TOGGLE_PLAY_PAUSE' });
  }, []);

  const closePlayer = useCallback(() => {
    dispatch({ type: 'CLOSE_PLAYER' });
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    dispatch({ type: 'SET_PLAYING', payload: playing });
  }, []);

  const setCurrentChapterId = useCallback((chapterId: string | null) => {
    if (chapterId) {
      dispatch({ type: 'PLAY_CHAPTER', payload: chapterId });
    }
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentBook,
        currentChapterId,
        isPlaying,
        playBook,
        playChapter,
        togglePlayPause,
        closePlayer,
        setIsPlaying,
        setCurrentChapterId,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  }
  return context;
}
