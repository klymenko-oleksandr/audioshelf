"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminBookForm } from "@/components/admin-book-form";
import { Loader2 } from "lucide-react";

interface BookData {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  coverObjectKey: string | null;
  chapters: Array<{
    id: string;
    title: string;
    order: number;
    objectKey: string;
    mimeType: string;
    duration: number;
  }>;
}

export default function EditBookPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as string;
  const [book, setBook] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const res = await fetch(`/api/admin/books/${bookId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Book not found");
          } else {
            setError("Failed to load book");
          }
          return;
        }
        const data = await res.json();
        setBook(data);
      } catch (err) {
        setError("Failed to load book");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [bookId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => router.push("/admin")}
            className="text-primary underline"
          >
            Back to Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Edit Audiobook</h1>
          <p className="text-muted-foreground">Update book details and chapters</p>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8">
        {book && (
          <AdminBookForm
            mode="edit"
            bookId={bookId}
            initialData={book}
          />
        )}
      </main>
    </div>
  );
}
