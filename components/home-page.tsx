"use client";

import { useState, useEffect, useCallback } from "react";
import { Book, BookProgress } from "@/lib/types";
import { BookList } from "./book-list";
import { AudioPlayerBar } from "./audio-player-bar";
import { getSessionId } from "@/lib/session";
import packageJson from "@/package.json";

export function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  const fetchBooksWithProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/books");
      if (!res.ok) throw new Error("Failed to fetch books");
      const booksData: Book[] = await res.json();

      const sessionId = getSessionId();
      if (sessionId) {
        const progressPromises = booksData.map(async (book) => {
          try {
            const progressRes = await fetch(
              `/api/books/${book.id}/progress?sessionId=${sessionId}`
            );
            if (progressRes.ok) {
              const progress: BookProgress = await progressRes.json();
              return { ...book, progress };
            }
          } catch {
            // Ignore progress fetch errors
          }
          return book;
        });

        const booksWithProgress = await Promise.all(progressPromises);
        setBooks(booksWithProgress);
      } else {
        setBooks(booksData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooksWithProgress();
  }, [fetchBooksWithProgress]);

  const handlePlay = (book: Book) => {
    setCurrentBook(book);
  };

  const handleClosePlayer = () => {
    setCurrentBook(null);
  };

  const handleProgressUpdate = () => {
    fetchBooksWithProgress();
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

      <AudioPlayerBar 
        book={currentBook} 
        onClose={handleClosePlayer}
        onProgressUpdate={handleProgressUpdate}
      />

      <footer className="fixed bottom-0 right-0 p-2 text-xs text-muted-foreground/50">
        v{packageJson.version}
      </footer>
    </div>
  );
}
