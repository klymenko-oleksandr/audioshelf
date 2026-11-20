import { Skeleton } from '@/components/ui/skeleton';

/** Shown when search is opened from another page; refining a search keeps the old results. */
export default function SearchLoading() {
  return (
    <div
      aria-busy="true"
      className="loader-delay flex flex-col gap-5 px-4 pt-3 pb-6 md:px-6 md:pt-7 lg:px-8"
    >
      <Skeleton className="h-11 w-full md:hidden" />
      <Skeleton className="h-8 w-3/5 max-w-90 md:h-9" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-13 shrink-0 md:size-14" />
            <div className="flex grow flex-col gap-2">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
