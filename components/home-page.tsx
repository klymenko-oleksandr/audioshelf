"use client";

import { useState, useEffect, useCallback } from "react";
import { Book } from "@/lib/types";
import { BookList } from "./book-list";
import packageJson from "@/package.json";
import { ThemeToggle } from "./theme-toggle";

export function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBooks = useCallback(async () => {
    try {
      const res = await fetch("/api/books");
      if (!res.ok) throw new Error("Failed to fetch books");
      const booksData: Book[] = await res.json();
      setBooks(booksData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audio Shelf</h1>
            <p className="text-muted-foreground">Your audiobook library</p>
          </div>
          <ThemeToggle />
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
          <BookList books={books} />
        )}
      </main>

      <footer className="fixed bottom-0 right-0 p-2 text-xs text-muted-foreground/50 z-40">
        v{packageJson.version}
      </footer>
    </div>
  );
}
