"use client";

import { useAdminBooks, useDeleteBook } from "@/lib/queries/admin";
import { Button } from "./ui/button";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

export function AdminBookList() {
  const { data: books, isLoading } = useAdminBooks();
  const deleteBook = useDeleteBook();

  const handleDelete = async (bookId: string, title: string) => {
    if (confirm(`Are you sure you want to delete "${title}"?`)) {
      try {
        await deleteBook.mutateAsync(bookId);
      } catch (error) {
        console.error("Failed to delete book:", error);
        alert("Failed to delete book. Please try again.");
      }
    }
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
    <div className="border rounded-lg divide-y">
      {books.map((book) => (
        <div
          key={book.id}
          className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <h3 className="font-medium">{book.title}</h3>
          <div className="flex items-center gap-2">
            <Link href={`/admin/books/${book.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil />
                Edit
              </Button>
            </Link>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(book.id, book.title)}
              disabled={deleteBook.isPending}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
