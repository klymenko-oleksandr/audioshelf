"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/components/audio-player-context";
import { ArrowLeft, Music, Play, Pause, Clock } from "lucide-react";
import { useBook } from "@/lib/queries/books";

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
  const { data: book, isLoading, error } = useBook(bookId);
  
  const { currentBook, currentChapterId, isPlaying, playBook, playChapter, togglePlayPause } = useAudioPlayer();

  const isCurrentBook = currentBook?.id === bookId;
  const isThisBookPlaying = isCurrentBook && isPlaying;

  const handlePlayBook = async () => {
    if (!book) return;
    if (isCurrentBook) {
      togglePlayPause();
    } else {
      await playBook(book);
    }
  };

  const handlePlayChapter = async (chapterId: string) => {
    if (!book) return;
    const isThisChapterPlaying = isCurrentBook && currentChapterId === chapterId && isPlaying;
    if (isThisChapterPlaying) {
      togglePlayPause();
    } else {
      playChapter(book, chapterId);
    }
  };

  if (isLoading) {
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
          <p className="text-red-500 mb-4">{error?.message || "Book not found"}</p>
          <Link href="/" className="text-primary underline">
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-3 py-8 flex">
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
            <div className="w-full md:w-96 aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
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
              {isThisBookPlaying ? (
                <>
                  <Pause className="w-5 h-5 mr-2" />
                  Pause
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
          <div className="space-y-1">
            {book.chapters.map((chapter, index) => {
              const isCurrentChapter = isCurrentBook && currentChapterId === chapter.id;
              const isChapterPlaying = isCurrentChapter && isPlaying;
              return (
                <div
                  key={chapter.id}
                  className={`flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors ${
                    isCurrentChapter ? "bg-primary/10" : ""
                  }`}
                >
                  <Button
                    variant={isChapterPlaying ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => handlePlayChapter(chapter.id)}
                  >
                    {isChapterPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                  <span className="text-muted-foreground text-sm w-6 flex-shrink-0">{index + 1}</span>
                  <span className={`flex-1 truncate ${isCurrentChapter ? "text-primary font-medium" : ""}`}>
                    {chapter.title}
                  </span>
                  <span className="text-sm text-muted-foreground flex-shrink-0">
                    {formatDuration(chapter.duration)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
