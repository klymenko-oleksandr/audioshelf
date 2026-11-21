import { Skeleton } from '@/components/ui/skeleton';

/** Shown while any admin page loads, so a slow database reads as "loading", not "broken". */
export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col">
      <div className="border-border flex h-16 items-center gap-3 border-b px-8">
        <Skeleton className="h-6 w-40" />
        <div className="grow" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-4 px-8 py-6">
        <Skeleton className="h-10 w-full max-w-md" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
