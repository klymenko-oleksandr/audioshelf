"use client";

import { useState, useEffect } from "react";
import { BookList } from "./book-list";
import { ThemeToggle } from "./theme-toggle";
import { useBooks } from "@/lib/queries/books";
import { Search, X } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function HomePage() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: books, isLoading, error } = useBooks(debouncedSearch);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleClear = () => {
    setSearchInput("");
    setDebouncedSearch("");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between lg:justify-start">
              <div>
                <h1 className="text-2xl font-bold">Audio Shelf</h1>
                <p className="text-muted-foreground">Your audiobook library</p>
              </div>
              <div className="lg:hidden">
                <ThemeToggle />
              </div>
            </div>
            <div className="relative flex-1 lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search by title or author..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchInput && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleClear}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>
          </div>
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
          <>
            {books.length === 0 && debouncedSearch && (
              <div className="text-center py-12 text-muted-foreground">
                No books found for &quot;{debouncedSearch}&quot;
              </div>
            )}
            {books.length === 0 && !debouncedSearch && (
              <div className="text-center py-12 text-muted-foreground">
                No audiobooks yet.
              </div>
            )}
            {books.length > 0 && <BookList books={books} />}
          </>
        )}
      </main>
    </div>
  );
}
