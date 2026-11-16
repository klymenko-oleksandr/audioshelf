import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseBookTab } from '@/features/catalogue/book-tabs';
import { BookDetail } from '@/features/catalogue/components/book-detail';
import { getBookBySlug } from '@/features/catalogue/data';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await getBookBySlug((await params).slug);
  if (!book) return {};
  return {
    title: book.title,
    description: book.description?.slice(0, 200) ?? book.author?.name,
  };
}

export default async function BookPage({ params, searchParams }: Props) {
  // Unknown, unpublished and deleted books all look the same from outside (PRD).
  const book = await getBookBySlug((await params).slug);
  if (!book) notFound();
  // Keyed by book, so going from one book to another starts on its default tab.
  return (
    <BookDetail key={book.id} book={book} initialTab={parseBookTab((await searchParams).tab)} />
  );
}
