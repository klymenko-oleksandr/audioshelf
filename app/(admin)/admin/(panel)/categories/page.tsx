import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CategoriesManager } from '@/features/admin/components/categories-manager';
import { PageHeader } from '@/features/admin/components/page-header';
import { PanelSkeleton } from '@/features/admin/components/panel-skeleton';
import { listAdminCategories } from '@/features/admin/categories/data';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { readDb } from '@/lib/db';
import { timed } from '@/lib/perf';

export const metadata: Metadata = { title: 'Categories' };

/** Canvas: AdminCategories. Always read fresh: it reads the session cookie and the live database. */
export default async function AdminCategoriesPage() {
  await requireAdminSession();
  return (
    <>
      <PageHeader title="Categories" summary="How books are grouped in Explore and on Home" />
      <Suspense fallback={<PanelSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </>
  );
}

async function CategoriesContent() {
  const categories = await timed('page.categories', () =>
    readDb('page.categories', (db) => listAdminCategories(db)),
  );
  return <CategoriesManager initial={categories} />;
}
