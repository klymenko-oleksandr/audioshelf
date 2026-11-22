import type { Metadata } from 'next';
import { BookForm } from '@/features/admin/components/book-form';
import { getBookFormOptions } from '@/features/admin/data/book-form';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { readDb } from '@/lib/db';
import { timed } from '@/lib/perf';

export const metadata: Metadata = { title: 'New book' };

/** Canvas: Admin. Always read fresh: it reads the session cookie and the live database. */
export default async function NewBookPage() {
  await requireAdminSession();
  const options = await timed('page.book-new', () =>
    readDb('page.book-new', (db) => getBookFormOptions(db)),
  );
  return <BookForm options={options} />;
}
