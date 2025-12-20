"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useAudioPlayer } from './audio-player-context';
import { usePlayUrl } from '@/lib/queries/books';

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
    currentChapterInitialPosition,
    isPlaying: contextIsPlaying,
    closePlayer,
    setIsPlaying: setContextIsPlaying,
    playChapter,
  } = useAudioPlayer();

  const playUrlMutation = usePlayUrl();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [initialPosition, setInitialPosition] = useState<number | null>(null);
  const [currentChapter, setCurrentChapter] = useState<CurrentChapter | null>(null);
  const [totalChapters, setTotalChapters] = useState(0);
  const lastBookIdRef = useRef<string | null>(null);
  const lastRequestedChapterIdRef = useRef<string | null>(null);

  const loadChapter = useCallback(async (chapterId: string, seekPosition?: number) => {
    if (!book || playUrlMutation.isPending) return;

    try {
      const playData = await playUrlMutation.mutateAsync({
        bookId: book.id,
        chapterId,
      });
      
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
      // Error is handled by mutation state
    }
  }, [book, playUrlMutation]);

  const goToNextChapter = useCallback(() => {
    if (!book || !currentChapter) return;
    const nextChapter = book.chapters.find(ch => ch.order === currentChapter.order + 1);
    if (nextChapter) {
      playChapter(book, nextChapter.id);
    } else {
      setContextIsPlaying(false);
    }
  }, [book, currentChapter, playChapter, setContextIsPlaying]);

  const goToPrevChapter = useCallback(() => {
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
      playChapter(book, prevChapter.id);
    }
  }, [book, currentChapter, currentTime, playChapter]);

  // Sync audio element with context isPlaying state
  useEffect(() => {
    if (!audioRef.current || playUrlMutation.isPending) return;
    
    if (contextIsPlaying && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else if (!contextIsPlaying && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [contextIsPlaying, playUrlMutation.isPending]);

  // Handle book/chapter changes from context
  useEffect(() => {
    if (!book || !requestedChapterId) {
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

    if (isNewBook || isNewChapterRequest) {
      lastBookIdRef.current = book.id;
      lastRequestedChapterIdRef.current = requestedChapterId;
      loadChapter(requestedChapterId, currentChapterInitialPosition);
    }
  }, [book, requestedChapterId, currentChapterInitialPosition, loadChapter]);


  // Autoplay when audio is loaded
  useEffect(() => {
    if (audioUrl && audioRef.current && !playUrlMutation.isPending) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl, playUrlMutation.isPending]);

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
      setCurrentTime(audioRef.current.currentTime);
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
    closePlayer();
  };

  const handlePlay = () => {
    setContextIsPlaying(true);
  };

  const handlePause = () => {
    setContextIsPlaying(false);
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
                disabled={playUrlMutation.isPending || !currentChapter || currentChapter.order === 1}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePlayPause}
              disabled={playUrlMutation.isPending || !!playUrlMutation.error}
            >
              {playUrlMutation.isPending ? (
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
                disabled={playUrlMutation.isPending || !currentChapter || currentChapter.order === totalChapters}
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
              disabled={playUrlMutation.isPending || !!playUrlMutation.error}
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

        {playUrlMutation.error && (
          <p className="text-xs text-red-500 mt-1">
            {playUrlMutation.error?.message || "Failed to load chapter"}
          </p>
        )}
      </div>
    </div>
  );
}
