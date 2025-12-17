import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createBookSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, author, coverUrl, chapters } = parsed.data;

    // Calculate total duration from all chapters
    const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0);

    const book = await db.book.create({
      data: {
        title,
        author,
        coverUrl,
        totalDuration,
        chapters: {
          create: chapters.map((ch) => ({
            title: ch.title,
            order: ch.order,
            objectKey: ch.objectKey,
            mimeType: ch.mimeType,
            duration: ch.duration,
          })),
        },
      },
      include: {
        chapters: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    console.error("Failed to create book:", error);
    return NextResponse.json(
      { error: "Failed to create book" },
      { status: 500 }
    );
  }
}
