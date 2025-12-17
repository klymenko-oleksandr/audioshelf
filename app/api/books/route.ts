import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const books = await db.book.findMany({
      include: {
        chapters: {
          select: {
            id: true,
            title: true,
            order: true,
            duration: true,
            mimeType: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(books);
  } catch (error) {
    console.error("Failed to fetch books:", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}
