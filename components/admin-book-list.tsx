"use client";

import { BookCard } from "./book-card";
import { useAdminBooks } from "@/lib/queries/admin";

export function AdminBookList() {
  const { data: books, isLoading } = useAdminBooks();

  const handleDelete = (bookId: string) => {
    // Cache will be automatically invalidated by useDeleteBook mutation
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading books...
      </div>
    );
  }

  if (!books || books.length === 0) {
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
          showEditButton={false}
          hidePlayButton={true}
        />
      ))}
    </div>
  );
}
