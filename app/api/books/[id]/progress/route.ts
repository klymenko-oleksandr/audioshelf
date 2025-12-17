import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";

const progressSchema = z.object({
  sessionId: z.string().min(1),
  position: z.number().min(0),
  duration: z.number().min(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const progress = await db.playbackProgress.findUnique({
      where: {
        sessionId_bookId: {
          sessionId,
          bookId: id,
        },
      },
    });

    if (!progress) {
      return NextResponse.json({ position: 0, duration: 0 });
    }

    return NextResponse.json({
      position: progress.position,
      duration: progress.duration,
    });
  } catch (error) {
    console.error("Failed to get progress:", error);
    return NextResponse.json(
      { error: "Failed to get progress" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = progressSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sessionId, position, duration } = parsed.data;

    const progress = await db.playbackProgress.upsert({
      where: {
        sessionId_bookId: {
          sessionId,
          bookId: id,
        },
      },
      update: {
        position,
        duration,
      },
      create: {
        sessionId,
        bookId: id,
        position,
        duration,
      },
    });

    return NextResponse.json({
      position: progress.position,
      duration: progress.duration,
    });
  } catch (error) {
    console.error("Failed to save progress:", error);
    return NextResponse.json(
      { error: "Failed to save progress" },
      { status: 500 }
    );
  }
}
