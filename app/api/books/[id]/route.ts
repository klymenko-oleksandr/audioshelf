import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPlayUrl } from "@/lib/s3";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Generate signed URL for cover if exists
    let coverUrl: string | null = null;
    if (book.coverObjectKey) {
      coverUrl = await createPlayUrl(book.coverObjectKey, 3600);
    }

    return NextResponse.json({
      ...book,
      coverUrl,
      coverObjectKey: undefined,
    });
  } catch (error) {
    console.error("Failed to fetch book:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}
