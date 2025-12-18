"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Book, BookProgress } from "@/lib/types";

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
  onProgressUpdate: () => void;
  registerProgressCallback: (callback: () => void) => void;
  registerSaveProgressCallback: (callback: () => Promise<void>) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressCallback, setProgressCallback] = useState<(() => void) | null>(null);
  const [saveProgressCallback, setSaveProgressCallback] = useState<(() => Promise<void>) | null>(null);

  const playBook = useCallback(async (book: Book, chapterId?: string) => {
    // Save progress of current book before switching
    if (saveProgressCallback) {
      await saveProgressCallback();
    }
    setCurrentBook(book);
    setCurrentChapterId(chapterId ?? null);
    setIsPlaying(true);
  }, [saveProgressCallback]);

  const playChapter = useCallback((chapterId: string) => {
    setCurrentChapterId(chapterId);
    setIsPlaying(true);
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
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

  const registerSaveProgressCallback = useCallback((callback: () => Promise<void>) => {
    setSaveProgressCallback(() => callback);
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
        onProgressUpdate,
        registerProgressCallback,
        registerSaveProgressCallback,
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
