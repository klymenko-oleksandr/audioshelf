import { PageHeader } from '@/features/admin/components/page-header';
import { ComingNext } from '@/features/admin/components/coming-next';

export default function AdminNotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <ComingNext>There is no such page in the admin panel.</ComingNext>
    </>
  );
}
