"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Book, BookProgress } from "@/lib/types";

interface AudioPlayerContextType {
  currentBook: Book | null;
  currentChapterId: string | null;
  isPlaying: boolean;
  playBook: (book: Book, chapterId?: string) => void;
  playChapter: (chapterId: string) => void;
  closePlayer: () => void;
  setIsPlaying: (playing: boolean) => void;
  onProgressUpdate: () => void;
  registerProgressCallback: (callback: () => void) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressCallback, setProgressCallback] = useState<(() => void) | null>(null);

  const playBook = useCallback((book: Book, chapterId?: string) => {
    setCurrentBook(book);
    setCurrentChapterId(chapterId ?? null);
    setIsPlaying(true);
  }, []);

  const playChapter = useCallback((chapterId: string) => {
    setCurrentChapterId(chapterId);
    setIsPlaying(true);
  }, []);

  const closePlayer = useCallback(() => {
    setCurrentBook(null);
    setCurrentChapterId(null);
    setIsPlaying(false);
  }, []);

  const onProgressUpdate = useCallback(() => {
    progressCallback?.();
  }, [progressCallback]);

  const registerProgressCallback = useCallback((callback: () => void) => {
    setProgressCallback(() => callback);
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentBook,
        currentChapterId,
        isPlaying,
        playBook,
        playChapter,
        closePlayer,
        setIsPlaying,
        onProgressUpdate,
        registerProgressCallback,
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
