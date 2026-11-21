import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookForm } from '@/features/admin/components/book-form';
import { getBookForEdit, getBookFormOptions } from '@/features/admin/data/book-form';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';
import { timed } from '@/lib/perf';

export const metadata: Metadata = { title: 'Edit book' };

/** Canvas: AdminEdit. An unknown, deleted or malformed id is the admin's own 404. */
export default async function EditBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const db = getDb();
  const [book, options] = await timed('page.book-edit', () =>
    Promise.all([getBookForEdit(db, id), getBookFormOptions(db)]),
  );
  if (!book) notFound();

  return <BookForm key={book.id} book={book} options={options} created={query.created === '1'} />;
}
