import { RiAddLine } from '@remixicon/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { DeletedNotice } from '@/features/admin/components/deleted-notice';
import { BooksKpis } from '@/features/admin/components/books-kpis';
import { BooksEmpty, BooksTable } from '@/features/admin/components/books-table';
import { BooksToolbar } from '@/features/admin/components/books-toolbar';
import { PanelSkeleton } from '@/features/admin/components/panel-skeleton';
import { PageHeader } from '@/features/admin/components/page-header';
import { getAdminBooks } from '@/features/admin/data/books';
import { formatHours } from '@/features/admin/format';
import { parseBooksQuery } from '@/features/admin/list-state';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { readDb } from '@/lib/db';
import { timed } from '@/lib/perf';

export const metadata: Metadata = { title: 'Books' };

/** Canvas: AdminBooks. Always read fresh: it reads the session cookie and the live database. */
export default async function AdminBooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const query = parseBooksQuery(params);
  const deleted = typeof params.deleted === 'string' ? params.deleted.slice(0, 200) : null;
  // A Suspense boundary here (not a loading.tsx) so unknown pages under /admin/books still answer 404.
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <BooksContent query={query} deleted={deleted} />
    </Suspense>
  );
}

async function BooksContent({
  query,
  deleted,
}: {
  query: ReturnType<typeof parseBooksQuery>;
  deleted: string | null;
}) {
  const { rows, counts, totals, categories } = await timed('page.books-list', () =>
    readDb('page.books-list', (db) => getAdminBooks(db, query)),
  );
  const filtered = Boolean(query.q || query.category || query.tab !== 'all');

  return (
    <>
      <PageHeader
        title="Books"
        summary={`${totals.books} ${totals.books === 1 ? 'book' : 'books'} · ${formatHours(totals.seconds)} of audio`}
      >
        <Link prefetch={false} href="/admin/books/new" className={buttonVariants()}>
          <RiAddLine aria-hidden />
          New book
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-4 px-8 py-6">
        {deleted && <DeletedNotice title={deleted} />}
        <BooksKpis totals={totals} />
        <BooksToolbar query={query} counts={counts} categories={categories} />
        {rows.length > 0 ? (
          <BooksTable rows={rows} now={new Date()} />
        ) : (
          <BooksEmpty filtered={filtered || totals.books > 0} />
        )}
      </div>
    </>
  );
}
