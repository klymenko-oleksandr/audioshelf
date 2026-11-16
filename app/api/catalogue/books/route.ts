import { NextResponse, type NextRequest } from 'next/server';
import { listBooksByIds, MAX_BOOK_IDS } from '@/features/catalogue/data';

/**
 * GET /api/catalogue/books?ids=a,b,c — card data for books the device has progress for
 * ("Continue listening"). Public: it only describes published books. Ids that are not live
 * are left out of the answer rather than reported.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_BOOK_IDS)
    .sort(); // one cache entry per set of books, whatever order they were asked in
  const books = ids.length > 0 ? await listBooksByIds(ids) : [];
  return NextResponse.json(
    { books },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
