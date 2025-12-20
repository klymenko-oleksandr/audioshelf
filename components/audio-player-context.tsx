"use client";

import { createContext, ReactNode, useCallback, useContext, useReducer } from 'react';
import { Book } from '@/lib/types';
import audioPlayerReducer from './audio-player/audioPlayerReducer';
import { AudioPlayerState } from './audio-player/audio-player.model';
import { API_PATHS } from '@/lib/api-paths';
import { getSessionId } from '@/lib/session';

interface AudioPlayerContextType {
  currentBook: Book | null;
  currentChapterId: string | null;
  currentChapterInitialPosition: number;
  isPlaying: boolean;
  playBook: (book: Book) => Promise<void>;
  playChapter: (book: Book, chapterId: string) => void;
  togglePlayPause: () => void;
  closePlayer: () => void;
  setIsPlaying: (playing: boolean) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

const initialState: AudioPlayerState = {
  currentBook: null,
  currentChapterId: null,
  currentChapterInitialPosition: 0,
  isPlaying: false,
};

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(audioPlayerReducer, initialState);
  const { currentBook, currentChapterId, currentChapterInitialPosition, isPlaying } = state;

  const playBook = useCallback(async (book: Book) => {
    const sessionId = getSessionId();
    
    let chapterId = book.chapters[0]?.id;
    let initialPosition = 0;
    
    if (sessionId) {
      try {
        const progressRes = await fetch(`${API_PATHS.books.progress(book.id)}?sessionId=${sessionId}`);
        if (progressRes.ok) {
          const progressData = await progressRes.json();
          if (progressData.currentChapterId && !progressData.completed) {
            chapterId = progressData.currentChapterId;
            initialPosition = progressData.position;
          }
        }
      } catch (err) {
        console.error("Failed to fetch progress:", err);
      }
    }

    dispatch({ 
      type: 'PLAY_BOOK', 
      payload: { book, chapterId, initialPosition } 
    });
  }, []);

  const playChapter = useCallback((book: Book, chapterId: string) => {
    dispatch({ type: 'PLAY_CHAPTER', payload: { book, chapterId } });
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

  return (
    <AudioPlayerContext.Provider
      value={{
        currentBook,
        currentChapterId,
        currentChapterInitialPosition,
        isPlaying,
        playBook,
        playChapter,
        togglePlayPause,
        closePlayer,
        setIsPlaying,
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
