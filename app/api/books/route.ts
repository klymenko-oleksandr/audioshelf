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
        let coverThumbnailUrl: string | null = null;
        let coverMediumUrl: string | null = null;
        let coverLargeUrl: string | null = null;
        
        // Prefer new variants, fallback to legacy coverObjectKey
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
        
        return {
          ...book,
          coverUrl,
          coverThumbnailUrl,
          coverMediumUrl,
          coverLargeUrl,
          coverObjectKey: undefined,
          coverThumbnailKey: undefined,
          coverMediumKey: undefined,
          coverLargeKey: undefined,
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
