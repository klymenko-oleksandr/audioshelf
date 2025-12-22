import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPlayUrl } from "@/lib/s3";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    const whereClause = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { author: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const books = await db.book.findMany({
      where: whereClause,
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

    // Generate signed URLs for cover images
    const booksWithCoverUrls = await Promise.all(
      books.map(async (book) => {
        let coverUrl: string | null = null;
        if (book.coverObjectKey) {
          coverUrl = await createPlayUrl(book.coverObjectKey, 3600); // 1 hour expiry
        }
        return {
          ...book,
          coverUrl,
          coverObjectKey: undefined, // Don't expose the object key
        };
      })
    );

    return NextResponse.json(booksWithCoverUrls);
  } catch (error) {
    console.error("Failed to fetch books:", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}
