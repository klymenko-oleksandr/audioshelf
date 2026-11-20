import type { Metadata } from 'next';
import { ComingNext } from '@/features/admin/components/coming-next';
import { PageHeader } from '@/features/admin/components/page-header';

export const metadata: Metadata = { title: 'Edit book' };

export default function EditBookPage() {
  return (
    <>
      <PageHeader title="Edit book" />
      <ComingNext>Editing a book arrives in the next step of the admin panel (4b).</ComingNext>
    </>
  );
}
