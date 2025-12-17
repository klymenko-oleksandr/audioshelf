import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/s3";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get book with chapters to delete S3 objects
    const book = await db.book.findUnique({
      where: { id },
      include: { chapters: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Delete all chapter audio files from S3
    await Promise.all(
      book.chapters.map((chapter) => 
        deleteObject(chapter.objectKey).catch((err) => {
          console.error(`Failed to delete S3 object ${chapter.objectKey}:`, err);
        })
      )
    );

    // Delete book from database (cascades to chapters and progress)
    await db.book.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete book:", error);
    return NextResponse.json(
      { error: "Failed to delete book" },
      { status: 500 }
    );
  }
}
