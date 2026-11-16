import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthorDetail } from '@/features/catalogue/components/author-detail';
import { getAuthorBySlug } from '@/features/catalogue/data';
import { parseBookSort } from '@/features/catalogue/sort';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const author = await getAuthorBySlug((await params).slug);
  if (!author) return {};
  return { title: author.name, description: author.bio?.slice(0, 200) };
}

/** An author's page (canvas: Author, MAuthor). Unknown authors, and authors with no live books, are NotFound. */
export default async function AuthorPage({ params, searchParams }: Props) {
  const author = await getAuthorBySlug((await params).slug);
  if (!author) notFound();
  return <AuthorDetail author={author} sort={parseBookSort((await searchParams).sort)} />;
}
