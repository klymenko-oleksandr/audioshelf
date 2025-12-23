import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteObject, createPlayUrl } from "@/lib/s3";
import { updateBookSchema } from "@/lib/validators";

// GET - Fetch book details for editing
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
    });
  } catch (error) {
    console.error("Failed to fetch book:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}

// PUT - Update book
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateBookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, author, description, coverObjectKey, coverThumbnailKey, coverMediumKey, coverLargeKey, removeCover, chapters, deletedChapterIds } = parsed.data;

    // Get existing book
    const existingBook = await db.book.findUnique({
      where: { id },
      include: { chapters: true },
    });

    if (!existingBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Handle cover image changes
    if (removeCover) {
      // Delete all old cover variants
      const deletePromises = [];
      if (existingBook.coverObjectKey) deletePromises.push(deleteObject(existingBook.coverObjectKey));
      if (existingBook.coverThumbnailKey) deletePromises.push(deleteObject(existingBook.coverThumbnailKey));
      if (existingBook.coverMediumKey) deletePromises.push(deleteObject(existingBook.coverMediumKey));
      if (existingBook.coverLargeKey) deletePromises.push(deleteObject(existingBook.coverLargeKey));
      await Promise.all(deletePromises).catch((err) => {
        console.error(`Failed to delete old cover variants:`, err);
      });
    } else if (coverThumbnailKey || coverMediumKey || coverLargeKey) {
      // New cover uploaded, delete old variants
      const deletePromises = [];
      if (existingBook.coverObjectKey) deletePromises.push(deleteObject(existingBook.coverObjectKey));
      if (existingBook.coverThumbnailKey) deletePromises.push(deleteObject(existingBook.coverThumbnailKey));
      if (existingBook.coverMediumKey) deletePromises.push(deleteObject(existingBook.coverMediumKey));
      if (existingBook.coverLargeKey) deletePromises.push(deleteObject(existingBook.coverLargeKey));
      await Promise.all(deletePromises).catch((err) => {
        console.error(`Failed to delete old cover variants:`, err);
      });
    }

    // Delete removed chapters from S3
    if (deletedChapterIds && deletedChapterIds.length > 0) {
      const chaptersToDelete = existingBook.chapters.filter((ch) =>
        deletedChapterIds.includes(ch.id)
      );
      await Promise.all(
        chaptersToDelete.map((ch) =>
          deleteObject(ch.objectKey).catch((err) => {
            console.error(`Failed to delete chapter audio ${ch.objectKey}:`, err);
          })
        )
      );
      // Delete from database
      await db.chapter.deleteMany({
        where: { id: { in: deletedChapterIds } },
      });
    }

    // Calculate total duration
    const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0);

    // Update book
    const updatedBook = await db.book.update({
      where: { id },
      data: {
        title,
        author,
        description,
        coverObjectKey: removeCover ? null : (coverObjectKey ?? existingBook.coverObjectKey),
        coverThumbnailKey: removeCover ? null : (coverThumbnailKey ?? existingBook.coverThumbnailKey),
        coverMediumKey: removeCover ? null : (coverMediumKey ?? existingBook.coverMediumKey),
        coverLargeKey: removeCover ? null : (coverLargeKey ?? existingBook.coverLargeKey),
        totalDuration,
      },
    });

    // Update existing chapters and create new ones
    for (const chapter of chapters) {
      if (chapter.id) {
        // Update existing chapter
        await db.chapter.update({
          where: { id: chapter.id },
          data: {
            title: chapter.title,
            order: chapter.order,
            objectKey: chapter.objectKey,
            mimeType: chapter.mimeType,
            duration: chapter.duration,
          },
        });
      } else {
        // Create new chapter
        await db.chapter.create({
          data: {
            bookId: id,
            title: chapter.title,
            order: chapter.order,
            objectKey: chapter.objectKey,
            mimeType: chapter.mimeType,
            duration: chapter.duration,
          },
        });
      }
    }

    // Fetch updated book with chapters
    const result = await db.book.findUnique({
      where: { id },
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to update book:", error);
    return NextResponse.json(
      { error: "Failed to update book" },
      { status: 500 }
    );
  }
}

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

    // Delete cover images from S3 if exist
    const deletePromises = [];
    if (book.coverObjectKey) deletePromises.push(deleteObject(book.coverObjectKey));
    if (book.coverThumbnailKey) deletePromises.push(deleteObject(book.coverThumbnailKey));
    if (book.coverMediumKey) deletePromises.push(deleteObject(book.coverMediumKey));
    if (book.coverLargeKey) deletePromises.push(deleteObject(book.coverLargeKey));
    await Promise.all(deletePromises).catch((err) => {
      console.error(`Failed to delete cover images:`, err);
    });

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
