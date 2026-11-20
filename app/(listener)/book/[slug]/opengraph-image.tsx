import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getBookBySlug } from '@/features/catalogue/data';
import { coverImage } from '@/lib/cover-image/render';

export const alt = 'Audiobook cover';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Link preview for a book page: the generated typographic cover, wide. It is the cover shown
 * in the app (not the uploaded image), so a shared link looks like the book does here.
 */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const book = await getBookBySlug((await params).slug);
  if (!book) notFound();
  const t = await getTranslations('app');
  return coverImage({
    slug: book.slug,
    title: book.title,
    author: book.author?.name,
    brand: t('name'),
    ...size,
  });
}
