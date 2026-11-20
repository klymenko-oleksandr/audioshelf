import type { Metadata } from 'next';
import { ComingNext } from '@/features/admin/components/coming-next';
import { PageHeader } from '@/features/admin/components/page-header';

export const metadata: Metadata = { title: 'New book' };

export default function NewBookPage() {
  return (
    <>
      <PageHeader title="New book" />
      <ComingNext>Adding a book arrives in the next step of the admin panel (4b).</ComingNext>
    </>
  );
}
