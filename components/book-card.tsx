"use client";

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
import { useAudioPlayer } from "./audio-player-context";
import { useDeleteBook } from "@/lib/queries/admin";

interface BookCardProps {
  book: Book;
  onDelete?: (bookId: string) => void;
  showEditButton?: boolean;
  hidePlayButton?: boolean;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export function BookCard({ book, onDelete, showEditButton, hidePlayButton = false }: BookCardProps) {
  const { currentBook, isPlaying, playBook, togglePlayPause } = useAudioPlayer();
  const deleteBook = useDeleteBook();
  const hasChapters = book.chapters && book.chapters.length > 0;
  const isCurrentBook = currentBook?.id === book.id;
  const isThisBookPlaying = isCurrentBook && isPlaying;

  const handleDelete = async () => {
    try {
      await deleteBook.mutateAsync(book.id);
      onDelete?.(book.id);
    } catch (err) {
      console.error("Failed to delete book:", err);
    }
  };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md pt-0">
      <div className="aspect-video relative bg-muted flex items-center justify-center">
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
                  disabled={deleteBook.isPending}
                >
                  {deleteBook.isPending ? (
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
        </div>
      </div>
      <Link href={`/books/${book.id}`}>
        <CardContent className="p-4 hover:bg-muted/50 transition-colors">
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
        </CardContent>
      </Link>
      {!hidePlayButton && hasChapters && (
        <div className="px-4 pb-3">
          <Button
            size="sm"
            variant={isThisBookPlaying ? "default" : "outline"}
            className="w-full"
            onClick={async (e) => {
              e.preventDefault();
              if (isCurrentBook) {
                togglePlayPause();
              } else {
                await playBook(book);
              }
            }}
          >
            {isThisBookPlaying ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Play
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
