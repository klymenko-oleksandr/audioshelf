import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPlayUrl } from "@/lib/s3";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { chapterId } = body as { chapterId?: string };

    const book = await db.book.findUnique({
      where: { id },
      include: { 
        chapters: { 
          orderBy: { order: "asc" } 
        } 
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (book.chapters.length === 0) {
      return NextResponse.json(
        { error: "No chapters available for this book" },
        { status: 404 }
      );
    }

    // Find the requested chapter, or default to first chapter
    let chapter = chapterId 
      ? book.chapters.find(c => c.id === chapterId)
      : book.chapters[0];

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const playUrl = await createPlayUrl(chapter.objectKey, 300);

    return NextResponse.json({ 
      playUrl, 
      mimeType: chapter.mimeType,
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        duration: chapter.duration,
      },
      totalChapters: book.chapters.length,
    });
  } catch (error) {
    console.error("Failed to generate play URL:", error);
    return NextResponse.json(
      { error: "Failed to generate play URL" },
      { status: 500 }
    );
  }
}
