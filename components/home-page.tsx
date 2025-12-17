"use client";

import { useState, useEffect } from "react";
import { Book } from "@/lib/types";
import { BookList } from "./book-list";
import { AudioPlayerBar } from "./audio-player-bar";

export function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const res = await fetch("/api/books");
        if (!res.ok) throw new Error("Failed to fetch books");
        const data = await res.json();
        setBooks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load books");
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  const handlePlay = (book: Book) => {
    setCurrentBook(book);
  };

  const handleClosePlayer = () => {
    setCurrentBook(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Audio Shelf</h1>
          <p className="text-muted-foreground">Your audiobook library</p>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8 pb-32">
        {loading && (
          <div className="text-center py-12 text-muted-foreground">
            Loading audiobooks...
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && (
          <BookList
            books={books}
            onPlay={handlePlay}
            currentBookId={currentBook?.id ?? null}
          />
        )}
      </main>

      <AudioPlayerBar book={currentBook} onClose={handleClosePlayer} />
    </div>
  );
}
