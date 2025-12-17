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

    const { title, author, coverUrl, objectKey, mimeType } = parsed.data;

    const book = await db.book.create({
      data: {
        title,
        author,
        coverUrl,
        audio: {
          create: {
            objectKey,
            mimeType,
          },
        },
      },
      include: {
        audio: true,
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
