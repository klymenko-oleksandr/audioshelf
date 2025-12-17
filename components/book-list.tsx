"use client";

import { Book } from "@/lib/types";
import { BookCard } from "./book-card";

interface BookListProps {
  books: Book[];
  onPlay: (book: Book) => void;
  currentBookId: string | null;
}

export function BookList({ books, onPlay, currentBookId }: BookListProps) {
  if (books.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No audiobooks available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onPlay={onPlay}
          isPlaying={currentBookId === book.id}
        />
      ))}
    </div>
  );
}
