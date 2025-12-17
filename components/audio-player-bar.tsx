"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Book, Chapter } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Play, Pause, X, Volume2, VolumeX, SkipBack, SkipForward } from "lucide-react";
import { getSessionId } from "@/lib/session";

interface AudioPlayerBarProps {
  book: Book | null;
  onClose: () => void;
  onProgressUpdate?: () => void;
}

interface CurrentChapter {
  id: string;
  title: string;
  order: number;
  duration: number;
}

export function AudioPlayerBar({ book, onClose, onProgressUpdate }: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
      onProgressUpdate?.();
    } catch (err) {
      console.error("Failed to save progress:", err);
    }
  }, [book, currentChapter, onProgressUpdate]);

  const loadChapter = useCallback(async (chapterId?: string, seekPosition?: number) => {
    if (!book || isLoadingChapterRef.current) return;
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
  }, [book]);

  const goToNextChapter = useCallback(async () => {
    if (!book || !currentChapter) return;
    const nextChapter = book.chapters.find(ch => ch.order === currentChapter.order + 1);
    if (nextChapter) {
      await loadChapter(nextChapter.id);
    } else {
      // Book finished
      setIsPlaying(false);
      saveProgress(currentChapter.duration, true);
    }
  }, [book, currentChapter, loadChapter, saveProgress]);

  const goToPrevChapter = useCallback(async () => {
    if (!book || !currentChapter) return;
    // If more than 3 seconds into chapter, restart current chapter
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }
    // Otherwise go to previous chapter
    const prevChapter = book.chapters.find(ch => ch.order === currentChapter.order - 1);
    if (prevChapter) {
      await loadChapter(prevChapter.id);
    }
  }, [book, currentChapter, currentTime, loadChapter]);

  useEffect(() => {
    if (!book) {
      setAudioUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setInitialPosition(null);
      setCurrentChapter(null);
      setTotalChapters(0);
      return;
    }

    const fetchProgressAndLoadChapter = async () => {
      const sessionId = getSessionId();
      
      // First, get saved progress to know which chapter to load
      let savedChapterId: string | undefined;
      let savedPosition = 0;
      
      if (sessionId) {
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

      // Load the chapter (saved one or first)
      await loadChapter(savedChapterId, savedPosition);
    };

    fetchProgressAndLoadChapter();
  }, [book, loadChapter]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      if (initialPosition !== null && initialPosition > 0) {
        audioRef.current.currentTime = initialPosition;
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl, initialPosition]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
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

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!book) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
      <div className="max-w-screen-xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Book info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 bg-muted rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">🎧</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium truncate text-sm">{book.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {currentChapter && totalChapters > 1 
                  ? `${currentChapter.title} • ${book.author}`
                  : book.author}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {totalChapters > 1 && (
              <Button
                size="icon"
                variant="ghost"
                onClick={goToPrevChapter}
                disabled={loading || !!error}
                title="Previous chapter"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={togglePlay}
              disabled={loading || !!error}
            >
              {loading ? (
                <span className="animate-spin">⏳</span>
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>
            {totalChapters > 1 && (
              <Button
                size="icon"
                variant="ghost"
                onClick={goToNextChapter}
                disabled={loading || !!error || (currentChapter?.order === totalChapters)}
                title="Next chapter"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMuted(!muted)}
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Progress */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md">
            <span className="text-xs text-muted-foreground w-10 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 accent-primary cursor-pointer"
            />
            <span className="text-xs text-muted-foreground w-10">
              {formatTime(duration)}
            </span>
          </div>

          {/* Close */}
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}

        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => {
              // Auto-advance to next chapter or mark as complete
              goToNextChapter();
            }}
            onPause={() => {
              if (audioRef.current) {
                saveProgress(audioRef.current.currentTime);
              }
            }}
            muted={muted}
          />
        )}
      </div>
    </div>
  );
}
