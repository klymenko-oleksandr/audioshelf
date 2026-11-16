import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BookSummary } from '../data/queries';
import { CatalogueCard } from './catalogue-card';

/**
 * Bleeds a horizontal scroller to the page edges, so cards slide under the page padding
 * instead of being cut at it. The vertical padding leaves room for focus outlines, which a
 * scroll container would otherwise clip.
 */
export const rowScroller =
  '-mx-4 -my-2 flex overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
  'scroll-px-4 snap-x md:-mx-6 md:scroll-px-6 md:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8';

interface HomeSectionProps {
  /** Unique on the page; ties the heading to the section. */
  id: string;
  title: string;
  /** Header link on the right ("See all", "Explore"). */
  link?: { href: string; label: string };
  children: ReactNode;
}

/** A titled Home row (canvas: Main, MHome). */
export function HomeSection({ id, title, link, children }: HomeSectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 md:gap-4">
      <div className="flex items-center justify-between gap-4 md:items-baseline">
        <h2
          id={id}
          className="font-heading md:text-h4 min-w-0 truncate text-[18px] leading-6 font-semibold"
        >
          {title}
        </h2>
        {link ? (
          <Link
            href={link.href}
            aria-label={`${link.label}: ${title}`}
            className="text-muted-foreground hover:text-foreground flex min-h-11 shrink-0 items-center rounded-sm text-[12px] font-medium md:min-h-0"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** One line of book cards that scrolls sideways: 128 px cards on phones, 168 px from tablets up. */
export function BookRow({ books }: { books: readonly BookSummary[] }) {
  return (
    <div className={cn(rowScroller, 'gap-3 lg:gap-6')}>
      {books.map((book) => (
        <CatalogueCard key={book.id} book={book} className="w-32 shrink-0 snap-start md:w-42" />
      ))}
    </div>
  );
}
