import { getBookBySlug } from '@/features/catalogue/data';
import { coverImage } from '@/lib/cover-image/render';

const SIZE = 512;

/**
 * The generated cover of a live book as a 512 px square PNG: the lock-screen artwork while
 * cover images are off. Unknown, draft and deleted books are 404, like their pages.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const book = await getBookBySlug((await params).slug);
  if (!book) return new Response('Not found', { status: 404 });
  return coverImage({
    slug: book.slug,
    title: book.title,
    author: book.author?.name,
    width: SIZE,
    height: SIZE,
    // A title can be corrected in the admin, so the image is not immutable like an R2 file.
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  });
}
