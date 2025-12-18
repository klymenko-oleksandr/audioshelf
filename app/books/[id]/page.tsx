"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Book } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAudioPlayer } from "@/components/audio-player-context";
import { ArrowLeft, Music, Play, Pause, Clock } from "lucide-react";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDurationLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
}

export default function BookDetailsPage() {
  const params = useParams();
  const bookId = params.id as string;
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { currentBook, currentChapterId, isPlaying, playBook, playChapter } = useAudioPlayer();

  const isCurrentBook = currentBook?.id === bookId;

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Book not found");
          } else {
            setError("Failed to load book");
          }
          return;
        }
        const data = await res.json();
        setBook(data);
      } catch (err) {
        setError("Failed to load book");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId]);

  const handlePlayBook = () => {
    if (book) {
      playBook(book);
    }
  };

  const handlePlayChapter = (chapterId: string) => {
    if (book) {
      if (isCurrentBook) {
        playChapter(chapterId);
      } else {
        playBook(book, chapterId);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || "Book not found"}</p>
          <Link href="/" className="text-primary underline">
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Library
          </Link>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8 mb-8">
          {/* Cover Image */}
          <div className="flex-shrink-0">
            <div className="w-48 h-48 md:w-64 md:h-64 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-16 h-16 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Book Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{book.title}</h1>
            <p className="text-xl text-muted-foreground mb-4">{book.author}</p>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDurationLong(book.totalDuration)}
              </span>
              <span>•</span>
              <span>{book.chapters.length} chapter{book.chapters.length !== 1 ? "s" : ""}</span>
            </div>

            <Button onClick={handlePlayBook} size="lg" className="mb-6">
              {isCurrentBook && isPlaying ? (
                <>
                  <Pause className="w-5 h-5 mr-2" />
                  Playing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  {book.progress && !book.progress.completed ? "Continue Listening" : "Play"}
                </>
              )}
            </Button>

            {book.description && (
              <div>
                <h2 className="font-semibold mb-2">Description</h2>
                <p className="text-muted-foreground whitespace-pre-wrap">{book.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Chapters List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Chapters</h2>
          <div className="space-y-2">
            {book.chapters.map((chapter, index) => {
              const isCurrentChapter = isCurrentBook && currentChapterId === chapter.id;
              return (
                <Card
                  key={chapter.id}
                  className={`p-4 flex items-center justify-between ${
                    isCurrentChapter ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground w-8">{index + 1}</span>
                    <div>
                      <p className={`font-medium ${isCurrentChapter ? "text-primary" : ""}`}>
                        {chapter.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(chapter.duration)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={isCurrentChapter ? "default" : "ghost"}
                    size="icon"
                    onClick={() => handlePlayChapter(chapter.id)}
                  >
                    {isCurrentChapter && isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
