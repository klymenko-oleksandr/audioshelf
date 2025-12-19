"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayer } from "./audio-player-context";
import { getSessionId } from "@/lib/session";

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

    // Save immediately when state changes (pause, chapter switch, book switch)
    const saveImmediately = async () => {
      const audio = audioRef.current;
      if (!audio || !currentBook || !currentChapterId) return;
      
      const sessionId = getSessionId();
      if (!sessionId) return;

      try {
        await fetch(`/api/books/${currentBook.id}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            chapterId: currentChapterId,
            position: audio.currentTime,
            completed: false,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    // Save immediately on any state change
    if (currentBook && currentChapterId && audioRef.current) {
      saveImmediately();
    }

    // Only set up interval when playing
    if (isPlaying && currentBook && currentChapterId && audioRef.current) {
      intervalRef.current = setInterval(async () => {
        const audio = audioRef.current;
        if (!audio || !currentBook || !currentChapterId) return;
        
        const sessionId = getSessionId();
        if (!sessionId) return;

        try {
          await fetch(`/api/books/${currentBook.id}/progress`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              chapterId: currentChapterId,
              position: audio.currentTime,
              completed: false,
            }),
          });
        } catch (err) {
          console.error("Failed to auto-save progress:", err);
        }
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
