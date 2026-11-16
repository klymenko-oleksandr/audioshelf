import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { rowScroller } from './book-row';

function RowSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <div className="flex flex-col gap-2.5 md:gap-4">
      <Skeleton className={cn('h-5 md:h-5.5', titleWidth)} />
      <div className={cn(rowScroller, 'gap-3 overflow-hidden lg:gap-6')}>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex w-32 shrink-0 flex-col gap-2 md:w-42 md:gap-2.5">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-3 w-4/5 md:h-3.25" />
            <Skeleton className="h-2.75 w-[55%] md:h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Home while the catalogue rows load (canvas: HomeLoading, MHomeLoading): skeletons in the
 * final layout, no spinner.
 *
 * `loader-delay` keeps it invisible for the first 300 ms (PRD: nothing appears when the data
 * arrives sooner). It is CSS only, because this is a server-rendered Suspense fallback.
 */
export function HomeRowsSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="loader-delay flex flex-col gap-6 md:gap-8">
      <span role="status" className="sr-only">
        {label}
      </span>
      <RowSkeleton titleWidth="w-37.5 md:w-45" />
      <RowSkeleton titleWidth="w-45 md:w-55" />
    </div>
  );
}
