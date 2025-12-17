"use client";

import { useRef, useState, useEffect } from "react";
import { Book } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Play, Pause, X, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerBarProps {
  book: Book | null;
  onClose: () => void;
}

export function AudioPlayerBar({ book, onClose }: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!book) {
      setAudioUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const fetchPlayUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/books/${book.id}/play-url`, {
          method: "POST",
        });
        if (!res.ok) throw new Error("Failed to get play URL");
        const data = await res.json();
        setAudioUrl(data.playUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audio");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayUrl();
  }, [book]);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl]);

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
      setCurrentTime(audioRef.current.currentTime);
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
                {book.author}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
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
            onEnded={() => setIsPlaying(false)}
            muted={muted}
          />
        )}
      </div>
    </div>
  );
}
