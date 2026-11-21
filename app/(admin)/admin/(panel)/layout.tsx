import type { ReactNode } from 'react';
import { AdminSidebar } from '@/features/admin/components/admin-sidebar';
import { requireAdminSession } from '@/lib/auth/admin/guard';

/**
 * Every admin page except the login sits in here: session check, sidebar, content area. It
 * never waits for the database, so the frame appears even when the database is slow.
 */
export default async function AdminPanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdminSession();

  return (
    <div className="grid min-h-dvh grid-cols-[240px_minmax(0,1fr)]">
      <AdminSidebar />
      <main id="content" tabIndex={-1} className="flex min-w-0 flex-col focus-visible:shadow-none">
        {children}
      </main>
    </div>
  );
}
