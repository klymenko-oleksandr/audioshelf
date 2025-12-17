"use client";

import { Book } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Music, Pause } from "lucide-react";

interface BookCardProps {
  book: Book;
  onPlay: (book: Book) => void;
  isPlaying: boolean;
}

export function BookCard({ book, onPlay, isPlaying }: BookCardProps) {
  const hasAudio = !!book.audio;
  const progress = book.progress;
  const progressPercent = progress && progress.duration > 0 
    ? Math.min((progress.position / progress.duration) * 100, 100)
    : 0;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <div className="aspect-square relative bg-muted flex items-center justify-center">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="w-12 h-12 text-muted-foreground" />
        )}
        {hasAudio && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-2 right-2 rounded-full shadow-lg"
            onClick={() => onPlay(book)}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-primary" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
        )}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div 
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold truncate" title={book.title}>
          {book.title}
        </h3>
        <p className="text-sm text-muted-foreground truncate" title={book.author}>
          {book.author}
        </p>
        {progressPercent > 0 && progressPercent < 100 && (
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round(progressPercent)}% complete
          </p>
        )}
        {progressPercent >= 100 && (
          <p className="text-xs text-green-600 mt-1">✓ Finished</p>
        )}
      </CardContent>
    </Card>
  );
}
