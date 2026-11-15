import { NextResponse } from 'next/server';
import { getPlayerBook } from '@/features/catalogue/data';

/**
 * GET /api/player/books/:id — what the player needs to play a book (tracks with public
 * URLs, chapters). Public: it only describes published books and files that are public
 * anyway. 404 for anything that is not live.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const book = await getPlayerBook((await params).id);
  if (!book) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(book, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
