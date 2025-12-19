"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayer } from "./audio-player-context";
import { useSaveProgress } from "@/lib/queries/books";

/**
 * AudioProgressPersister
 * 
 * Centralized component responsible for persisting audio playback progress.
 * - Saves progress every 5 seconds when audio is playing
 * - Stops saving when audio is paused
 * - This is the ONLY place where periodic progress updates should occur
 */
export function AudioProgressPersister() {
  const { currentBook, currentChapterId, isPlaying } = useAudioPlayer();
  const saveProgress = useSaveProgress();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Find and cache the audio element reference
  useEffect(() => {
    const findAudioElement = () => {
      const audio = document.querySelector('audio');
      if (audio) {
        audioRef.current = audio;
      }
    };
    
    findAudioElement();
    // Re-check periodically in case audio element is added later
    const checkInterval = setInterval(findAudioElement, 1000);
    
    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Save immediately on any state change
    if (currentBook && currentChapterId && audioRef.current) {
      const audio = audioRef.current;
      saveProgress.mutate({
        bookId: currentBook.id,
        chapterId: currentChapterId,
        position: audio.currentTime,
        completed: false,
      });
    }

    // Only set up interval when playing
    if (isPlaying && currentBook && currentChapterId && audioRef.current) {
      intervalRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (!audio || !currentBook || !currentChapterId) return;
        
        saveProgress.mutate({
          bookId: currentBook.id,
          chapterId: currentChapterId,
          position: audio.currentTime,
          completed: false,
        });
      }, 5000); // Save every 5 seconds
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, currentBook, currentChapterId]);

  return null; // Invisible component
}
