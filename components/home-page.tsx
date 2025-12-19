"use client";

import { BookList } from "./book-list";
import packageJson from "@/package.json";
import { ThemeToggle } from "./theme-toggle";
import { useBooks } from "@/lib/queries/books";

export function HomePage() {
  const { data: books, isLoading, error } = useBooks();

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

      <footer className="fixed bottom-0 right-0 p-2 text-xs text-muted-foreground/50 z-40">
        v{packageJson.version}
      </footer>
    </div>
  );
}
