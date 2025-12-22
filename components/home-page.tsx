"use client";

import { BookList } from "./book-list";
import { ThemeToggle } from "./theme-toggle";
import { useBooks } from "@/lib/queries/books";

export function HomePage() {
  const { data: books, isLoading, error } = useBooks();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto p-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audio Shelf</h1>
            <p className="text-muted-foreground">Your audiobook library</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground">
            Loading audiobooks...
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500">
            {error.message || "Failed to load books"}
          </div>
        )}

        {!isLoading && !error && books && (
          <BookList books={books} />
        )}
      </main>
    </div>
  );
}
