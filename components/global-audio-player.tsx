"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, X, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { getSessionId } from "@/lib/session";
import { useAudioPlayer } from "./audio-player-context";

interface CurrentChapter {
  id: string;
  title: string;
  order: number;
  duration: number;
}

export function GlobalAudioPlayer() {
  const { 
    currentBook: book, 
    currentChapterId: requestedChapterId,
    isPlaying: contextIsPlaying,
    closePlayer, 
    onProgressUpdate,
    setIsPlaying: setContextIsPlaying,
    setCurrentChapterId: setContextChapterId,
    registerSaveProgressCallback,
  } = useAudioPlayer();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [currentChapter, setCurrentChapter] = useState<CurrentChapter | null>(null);
  const [totalChapters, setTotalChapters] = useState(0);
  const lastSaveRef = useRef<number>(0);
  const isLoadingChapterRef = useRef(false);
  const lastBookIdRef = useRef<string | null>(null);
  const lastRequestedChapterIdRef = useRef<string | null>(null);

  const saveProgress = useCallback(async (position: number, completed = false) => {
    if (!book || !currentChapter) return;
    const sessionId = getSessionId();
    if (!sessionId) return;

    try {
      await fetch(`/api/books/${book.id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sessionId, 
          chapterId: currentChapter.id,
          position, 
          completed,
        }),
      });
      onProgressUpdate();
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  }, [book, currentChapter, onProgressUpdate]);

  const loadChapter = useCallback(async (chapterId?: string, seekPosition?: number) => {
    if (!book || isLoadingChapterRef.current) return;
    
    // Save progress of current chapter before switching
    if (currentChapter && audioRef.current) {
      await saveProgress(audioRef.current.currentTime);
    }
    
    isLoadingChapterRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const playRes = await fetch(`/api/books/${book.id}/play-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });

      if (!playRes.ok) throw new Error("Failed to get play URL");
      const playData = await playRes.json();
      
      setAudioUrl(playData.playUrl);
      setCurrentChapter(playData.chapter);
      setTotalChapters(playData.totalChapters);
      // Sync chapter ID back to context so other components know which chapter is playing
      setContextChapterId(playData.chapter.id);
      
      if (seekPosition !== undefined && seekPosition > 0) {
        setInitialPosition(seekPosition);
        setCurrentTime(seekPosition);
      } else {
        setInitialPosition(null);
        setCurrentTime(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chapter");
    } finally {
      setLoading(false);
      isLoadingChapterRef.current = false;
    }
  }, [book, currentChapter, saveProgress, setContextChapterId]);

  const goToNextChapter = useCallback(async () => {
    if (!book || !currentChapter) return;
    const nextChapter = book.chapters.find(ch => ch.order === currentChapter.order + 1);
    if (nextChapter) {
      await loadChapter(nextChapter.id);
    } else {
      setContextIsPlaying(false);
      saveProgress(currentChapter.duration, true);
    }
  }, [book, currentChapter, loadChapter, saveProgress, setContextIsPlaying]);

  const goToPrevChapter = useCallback(async () => {
    if (!book || !currentChapter) return;
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    const prevChapter = book.chapters.find(ch => ch.order === currentChapter.order - 1);
    if (prevChapter) {
      await loadChapter(prevChapter.id);
    }
  }, [book, currentChapter, currentTime, loadChapter]);

  // Sync audio element with context isPlaying state
  useEffect(() => {
    if (!audioRef.current || loading) return;
    
    if (contextIsPlaying && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else if (!contextIsPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [contextIsPlaying, loading]);

  // Handle book changes
  useEffect(() => {
    if (!book) {
      setAudioUrl(null);
      setCurrentTime(0);
      setDuration(0);
      setInitialPosition(null);
      setCurrentChapter(null);
      setTotalChapters(0);
      lastBookIdRef.current = null;
      lastRequestedChapterIdRef.current = null;
      return;
    }

    const isNewBook = book.id !== lastBookIdRef.current;
    const isNewChapterRequest = requestedChapterId !== lastRequestedChapterIdRef.current;

    if (isNewBook || (isNewChapterRequest && requestedChapterId)) {
      lastBookIdRef.current = book.id;
      lastRequestedChapterIdRef.current = requestedChapterId;

      const fetchProgressAndLoadChapter = async () => {
        const sessionId = getSessionId();
        
        let savedChapterId: string | undefined = requestedChapterId ?? undefined;
        let savedPosition = 0;
        
        if (!requestedChapterId && sessionId) {
          try {
            const progressRes = await fetch(`/api/books/${book.id}/progress?sessionId=${sessionId}`);
            if (progressRes.ok) {
              const progressData = await progressRes.json();
              if (progressData.currentChapterId && !progressData.completed) {
                savedChapterId = progressData.currentChapterId;
                savedPosition = progressData.position;
              }
            }
          } catch (err) {
            console.error("Failed to fetch progress:", err);
          }
        }

        await loadChapter(savedChapterId, savedPosition);
      };

      fetchProgressAndLoadChapter();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, requestedChapterId]);

  // Handle chapter change requests from context (for switching chapters within the same book)
  useEffect(() => {
    // Only handle explicit chapter switches, not initial load
    // The book change effect handles initial load with saved position
    if (
      requestedChapterId && 
      currentChapter && 
      requestedChapterId !== currentChapter.id &&
      book?.id === lastBookIdRef.current &&
      lastRequestedChapterIdRef.current !== requestedChapterId
    ) {
      lastRequestedChapterIdRef.current = requestedChapterId;
      loadChapter(requestedChapterId);
    }
  }, [requestedChapterId, currentChapter, book, loadChapter]);

  // Register save progress callback so context can trigger saves before switching books
  useEffect(() => {
    const saveCurrentProgress = async () => {
      if (currentChapter && audioRef.current) {
        await saveProgress(audioRef.current.currentTime);
      }
    };
    registerSaveProgressCallback(saveCurrentProgress);
  }, [currentChapter, saveProgress, registerSaveProgressCallback]);

  // Auto-play when audio is loaded
  useEffect(() => {
    if (audioUrl && audioRef.current && !loading) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl, loading]);

  // Seek to initial position when metadata is loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      if (initialPosition !== null && initialPosition > 0) {
        audioRef.current.currentTime = initialPosition;
        setInitialPosition(null);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      
      const now = Date.now();
      if (now - lastSaveRef.current > 10000) {
        lastSaveRef.current = now;
        saveProgress(time);
      }
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (contextIsPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClose = () => {
    if (currentChapter) {
      saveProgress(currentTime);
    }
    closePlayer();
  };

  const handlePlay = () => {
    setContextIsPlaying(true);
  };

  const handlePause = () => {
    setContextIsPlaying(false);
    if (currentChapter) {
      saveProgress(currentTime);
    }
  };

  const handleEnded = () => {
    goToNextChapter();
  };

  if (!book) return null;

  const hasMultipleChapters = totalChapters > 1;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        muted={muted}
      />
      
      <div className="max-w-screen-xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{book.title}</p>
            <p className="text-sm text-muted-foreground truncate">
              {book.author}
              {hasMultipleChapters && currentChapter && (
                <span> • {currentChapter.title}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {hasMultipleChapters && (
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevChapter}
                disabled={loading || !currentChapter || currentChapter.order === 1}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              disabled={loading || !!error}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : contextIsPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>

            {hasMultipleChapters && (
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextChapter}
                disabled={loading || !currentChapter || currentChapter.order === totalChapters}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 flex-1">
            <span className="text-xs text-muted-foreground w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
              disabled={loading || !!error}
            />
            <span className="text-xs text-muted-foreground w-10">
              {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMuted(!muted)}
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}
