import { count, isNull } from 'drizzle-orm';
import type { ReactNode } from 'react';
import { books } from '@/db/schema';
import { AdminSidebar } from '@/features/admin/components/admin-sidebar';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';

/** Every admin page except the login sits in here: session check, sidebar, content area. */
export default async function AdminPanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdminSession();
  const [row] = await getDb().select({ total: count() }).from(books).where(isNull(books.deletedAt));

  return (
    <div className="grid min-h-dvh grid-cols-[240px_minmax(0,1fr)]">
      <AdminSidebar bookCount={row?.total ?? 0} />
      <main id="content" tabIndex={-1} className="flex min-w-0 flex-col focus-visible:shadow-none">
        {children}
      </main>
    </div>
  );
}
