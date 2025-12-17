"use client";

import { Book } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Music } from "lucide-react";

interface BookCardProps {
  book: Book;
  onPlay: (book: Book) => void;
  isPlaying: boolean;
}

export function BookCard({ book, onPlay, isPlaying }: BookCardProps) {
  const hasAudio = !!book.audio;

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
            <Play className={`w-4 h-4 ${isPlaying ? "text-primary" : ""}`} />
          </Button>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold truncate" title={book.title}>
          {book.title}
        </h3>
        <p className="text-sm text-muted-foreground truncate" title={book.author}>
          {book.author}
        </p>
      </CardContent>
    </Card>
  );
}
