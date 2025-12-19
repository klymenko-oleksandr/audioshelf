"use client";

import { useState, useEffect } from "react";
import { Book } from "@/lib/types";
import { BookCard } from "./book-card";

export function AdminBookList() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBooks = async () => {
    try {
      const res = await fetch("/api/books");
      if (res.ok) {
        const data = await res.json();
        setBooks(data);
      }
    } catch (err) {
      console.error("Failed to fetch books:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleDelete = (bookId: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading books...
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No audiobooks yet. Upload one above.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onDelete={handleDelete}
          showEditButton={true}
          hidePlayButton={true}
        />
      ))}
    </div>
  );
}
