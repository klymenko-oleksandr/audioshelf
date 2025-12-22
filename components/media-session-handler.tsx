"use client";

import { useEffect, useRef } from "react";
import { useAudioPlayer } from "./audio-player-context";

interface MediaSessionHandlerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  currentChapter: {
    id: string;
    title: string;
    order: number;
    duration: number;
  } | null;
  totalChapters: number;
  onNextChapter: () => void;
  onPrevChapter: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
}

export function MediaSessionHandler({
  audioRef,
  currentChapter,
  totalChapters,
  onNextChapter,
  onPrevChapter,
  onSeekBackward,
  onSeekForward,
}: MediaSessionHandlerProps) {
  const { currentBook, isPlaying, togglePlayPause } = useAudioPlayer();
  const lastMetadataRef = useRef<string>("");

  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentBook || !currentChapter) {
      return;
    }

    const metadataKey = `${currentBook.id}-${currentChapter.id}`;
    
    // Only update if metadata has changed
    if (lastMetadataRef.current === metadataKey) {
      return;
    }

    lastMetadataRef.current = metadataKey;

    // Set metadata for lock screen and notifications
    const artwork = currentBook.coverUrl
      ? [
          { src: currentBook.coverUrl, sizes: "96x96", type: "image/jpeg" },
          { src: currentBook.coverUrl, sizes: "128x128", type: "image/jpeg" },
          { src: currentBook.coverUrl, sizes: "192x192", type: "image/jpeg" },
          { src: currentBook.coverUrl, sizes: "256x256", type: "image/jpeg" },
          { src: currentBook.coverUrl, sizes: "384x384", type: "image/jpeg" },
          { src: currentBook.coverUrl, sizes: "512x512", type: "image/jpeg" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: totalChapters > 1 ? currentChapter.title : currentBook.title,
      artist: currentBook.author,
      album: currentBook.title,
      artwork,
    });

    // Set playback state
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [currentBook, currentChapter, totalChapters, isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    // Play action
    navigator.mediaSession.setActionHandler("play", () => {
      if (audioRef.current) {
        audioRef.current.play();
      }
    });

    // Pause action
    navigator.mediaSession.setActionHandler("pause", () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    });

    // Previous track (previous chapter or restart current)
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      onPrevChapter();
    });

    // Next track (next chapter)
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      onNextChapter();
    });

    // Seek backward (10 seconds)
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      if (audioRef.current) {
        const seekTime = details.seekOffset || 10;
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seekTime);
      }
    });

    // Seek forward (10 seconds)
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      if (audioRef.current) {
        const seekTime = details.seekOffset || 10;
        audioRef.current.currentTime = Math.min(
          audioRef.current.duration,
          audioRef.current.currentTime + seekTime
        );
      }
    });

    // Seek to specific position
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (audioRef.current && details.seekTime !== null && details.seekTime !== undefined) {
        audioRef.current.currentTime = details.seekTime;
      }
    });

    // Cleanup
    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("seekto", null);
      }
    };
  }, [audioRef, onNextChapter, onPrevChapter, onSeekBackward, onSeekForward]);

  // Update position state for lock screen scrubbing
  useEffect(() => {
    if (!("mediaSession" in navigator) || !audioRef.current) {
      return;
    }

    const audio = audioRef.current;

    const updatePositionState = () => {
      if ("setPositionState" in navigator.mediaSession && audio.duration) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (error) {
          // Some browsers might not support this yet
          console.debug("setPositionState not supported:", error);
        }
      }
    };

    audio.addEventListener("loadedmetadata", updatePositionState);
    audio.addEventListener("timeupdate", updatePositionState);
    audio.addEventListener("ratechange", updatePositionState);

    return () => {
      audio.removeEventListener("loadedmetadata", updatePositionState);
      audio.removeEventListener("timeupdate", updatePositionState);
      audio.removeEventListener("ratechange", updatePositionState);
    };
  }, [audioRef, currentChapter]);

  return null;
}
