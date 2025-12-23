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

    // Generate signed URLs for cover variants
    let coverUrl: string | null = null;
    let coverThumbnailUrl: string | null = null;
    let coverMediumUrl: string | null = null;
    let coverLargeUrl: string | null = null;
    
    if (book.coverThumbnailKey) {
      coverThumbnailUrl = await createPlayUrl(book.coverThumbnailKey, 3600);
    }
    if (book.coverMediumKey) {
      coverMediumUrl = await createPlayUrl(book.coverMediumKey, 3600);
    }
    if (book.coverLargeKey) {
      coverLargeUrl = await createPlayUrl(book.coverLargeKey, 3600);
    }
    
    // Use medium as default, or fallback to legacy
    coverUrl = coverMediumUrl;
    if (!coverUrl && book.coverObjectKey) {
      coverUrl = await createPlayUrl(book.coverObjectKey, 3600);
    }

    return NextResponse.json({
      ...book,
      coverUrl,
      coverThumbnailUrl,
      coverMediumUrl,
      coverLargeUrl,
      coverObjectKey: undefined,
      coverThumbnailKey: undefined,
      coverMediumKey: undefined,
      coverLargeKey: undefined,
    });
  } catch (error) {
    console.error("Failed to fetch book:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}
