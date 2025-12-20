"use client";

import { useEffect, useRef, useState } from "react";
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
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  
  // Find and track the audio element
  useEffect(() => {
    const findAudioElement = () => {
      const audio = document.querySelector('audio');
      if (audio && audio !== audioElement) {
        setAudioElement(audio);
      }
    };
    
    findAudioElement();
    // Re-check periodically in case audio element is added later
    const checkInterval = setInterval(findAudioElement, 1000);
    
    return () => clearInterval(checkInterval);
  }, [audioElement]);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only set up interval when playing and audio element is available
    if (isPlaying && currentBook && currentChapterId && audioElement) {
      intervalRef.current = setInterval(() => {
        if (!audioElement || !currentBook || !currentChapterId) return;
        
        saveProgress.mutate({
          bookId: currentBook.id,
          chapterId: currentChapterId,
          position: audioElement.currentTime,
          completed: false,
        });
      }, 5000); // Save every 5 seconds
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentBook, currentChapterId, audioElement]);

  return null; // Invisible component
}
