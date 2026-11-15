import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticBookDetail } from '@/features/catalogue/components/static-book-detail';
import { findBookBySlug, TEST_BOOK } from '@/features/player/data/static-books';

type Props = { params: Promise<{ slug: string }> };

// TEMPORARY (Phase 2): only the static books exist. Phase 3 reads from the database.
function find(slug: string) {
  const book = findBookBySlug(slug);
  return book && book !== TEST_BOOK ? book : undefined;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = find((await params).slug);
  return book ? { title: book.title, description: book.author } : {};
}

export default async function BookPage({ params }: Props) {
  const book = find((await params).slug);
  if (!book) notFound();
  return <StaticBookDetail book={book} />;
}
