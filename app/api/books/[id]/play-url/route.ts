import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPlayUrl } from "@/lib/s3";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const book = await db.book.findUnique({
      where: { id },
      include: { audio: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (!book.audio) {
      return NextResponse.json(
        { error: "No audio available for this book" },
        { status: 404 }
      );
    }

    const playUrl = await createPlayUrl(book.audio.objectKey, 300);

    return NextResponse.json({ playUrl, mimeType: book.audio.mimeType });
  } catch (error) {
    console.error("Failed to generate play URL:", error);
    return NextResponse.json(
      { error: "Failed to generate play URL" },
      { status: 500 }
    );
  }
}
