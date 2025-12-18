"use client";

import { useState } from "react";
import { Book } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Music, Pause, Trash2, Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BookCardProps {
  book: Book;
  onPlay: (book: Book) => void;
  onDelete?: (bookId: string) => void;
  onEdit?: (bookId: string) => void;
  isPlaying: boolean;
  showEditButton?: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function BookCard({ book, onPlay, onDelete, onEdit, isPlaying, showEditButton }: BookCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const hasChapters = book.chapters && book.chapters.length > 0;
  const progress = book.progress;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/books/${book.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDelete?.(book.id);
      }
    } catch (err) {
      console.error("Failed to delete book:", err);
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Calculate progress percentage based on chapters
  let progressPercent = 0;
  if (progress && hasChapters) {
    if (progress.completed) {
      progressPercent = 100;
    } else if (progress.currentChapterId) {
      const currentChapterIndex = book.chapters.findIndex(
        (ch) => ch.id === progress.currentChapterId
      );
      if (currentChapterIndex >= 0) {
        const currentChapter = book.chapters[currentChapterIndex];
        // Progress = completed chapters + progress in current chapter
        const completedDuration = book.chapters
          .slice(0, currentChapterIndex)
          .reduce((sum, ch) => sum + ch.duration, 0);
        const currentProgress = currentChapter.duration > 0
          ? (progress.position / currentChapter.duration) * currentChapter.duration
          : 0;
        const totalProgress = completedDuration + currentProgress;
        progressPercent = book.totalDuration > 0
          ? Math.min((totalProgress / book.totalDuration) * 100, 100)
          : 0;
      }
    }
  }

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
        <div className="absolute bottom-2 right-2 flex gap-1">
          {showEditButton && (
            <Link href={`/admin/books/${book.id}/edit`}>
              <Button
                size="icon"
                variant="secondary"
                className="rounded-full shadow-lg h-8 w-8"
              >
                <Pencil className="w-3 h-3" />
              </Button>
            </Link>
          )}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full shadow-lg h-8 w-8"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{book.title}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this audiobook and all its chapters. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {hasChapters && (
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full shadow-lg"
              onClick={() => onPlay(book)}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-primary" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
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
        <div className="flex items-center gap-2 mt-1">
          {book.totalDuration > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(book.totalDuration)}
            </span>
          )}
          {book.chapters.length > 1 && (
            <span className="text-xs text-muted-foreground">
              • {book.chapters.length} chapters
            </span>
          )}
        </div>
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
