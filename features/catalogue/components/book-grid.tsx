import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BookSummary } from '../data/queries';
import type { BookSort } from '../sort';
import { CatalogueCard } from './catalogue-card';
import { SortMenu } from './sort-menu';

/**
 * Fluid columns (PRD: auto-fill, 140 px minimum): two on a phone, six at the canvas's
 * 1440 px desktop.
 */
const grid =
  'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-3 gap-y-4 md:gap-x-6 md:gap-y-7 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]';

/** A grid of book cards (canvas: Category, MCategory, Author, MAuthor). */
export function BookGrid({ books }: { books: readonly BookSummary[] }) {
  return (
    <div className={grid}>
      {books.map((book) => (
        <CatalogueCard key={book.id} book={book} />
      ))}
    </div>
  );
}

/** The line above a book list: how many books, and the sort button (canvas: Category). */
export function ListToolbar({ countLabel, sort }: { countLabel: string; sort: BookSort }) {
  return (
    <div className="border-border flex items-center justify-between gap-4 border-y py-2 md:py-3">
      <span className="text-muted-foreground text-[12px]">{countLabel}</span>
      <SortMenu sort={sort} />
    </div>
  );
}

/**
 * A book list while it loads: skeleton cards in the final layout. `loader-delay` keeps it
 * invisible for the first 300 ms (see `HomeRowsSkeleton`).
 */
export function BookGridSkeleton({ label, count = 12 }: { label: string; count?: number }) {
  return (
    <div aria-busy="true" className="loader-delay flex flex-col gap-5">
      <span role="status" className="sr-only">
        {label}
      </span>
      <Skeleton className="h-8 w-full max-w-90" />
      <div className={cn(grid, 'max-h-150 overflow-hidden')}>
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 md:gap-2.5">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-3 w-4/5 md:h-3.25" />
            <Skeleton className="h-2.75 w-[55%] md:h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
