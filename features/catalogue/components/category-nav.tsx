import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CategoryCount } from '../data/queries';
import { categoryName } from '../names';

interface CategoryChipsProps {
  categories: readonly CategoryCount[];
  locale: string;
  /** Which chip is filled: a category slug, or `'all'` for the first chip. */
  selected: string;
  /**
   * The filled chip is the page being viewed (Explore, Category). On Home it is not: "All"
   * is filled there as on the canvas, but it leads to Explore.
   */
  current?: boolean;
  /** Accessible name of the list ("Categories"). */
  label: string;
  /** Text of the first chip ("All"). */
  allLabel: string;
  className?: string;
}

/**
 * Category chips (canvas: Main, MHome, Category): "All" opens Explore, each category opens
 * its page. One line that scrolls sideways on phones, wrapping from tablets up.
 */
export function CategoryChips({
  categories,
  locale,
  selected,
  current = false,
  label,
  allLabel,
  className,
}: CategoryChipsProps) {
  if (categories.length === 0) return null;
  const chips = [
    { key: 'all', href: '/explore', text: allLabel },
    ...categories.map((category) => ({
      key: category.slug,
      href: `/category/${category.slug}`,
      text: categoryName(category, locale),
    })),
  ];

  return (
    <nav aria-label={label} className={className}>
      {/* The vertical padding leaves room for focus outlines inside the scroller. */}
      <ul className="-mx-4 -my-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => {
          const on = chip.key === selected;
          return (
            <li key={chip.key} className="shrink-0">
              <Link
                href={chip.href}
                aria-current={on && current ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: on ? 'default' : 'outline', size: 'sm' }),
                  'h-8 px-3',
                )}
              >
                {chip.text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Cover-like colour pairs from the canvas (MExplore), in its order.
const TILE_TONES = [
  'bg-foreground text-background',
  'bg-primary text-primary-foreground',
  'bg-chart-3 text-zinc-50',
  'bg-chart-1 text-chart-5',
  'bg-chart-5 text-chart-1',
  'bg-sidebar-primary text-chart-5',
];

interface CategoryTilesProps {
  categories: readonly CategoryCount[];
  locale: string;
  /** Formats a tile's count line ("12 books"). */
  countLabel: (count: number) => string;
  className?: string;
}

/**
 * Category tiles (canvas: MExplore, Search): two per line, or as many as `className` asks
 * for. The search page shows four per line from tablets up.
 */
export function CategoryTiles({ categories, locale, countLabel, className }: CategoryTilesProps) {
  return (
    <ul className={cn('grid grid-cols-2 gap-2.5', className)}>
      {categories.map((category, index) => (
        <li key={category.slug}>
          <Link
            href={`/category/${category.slug}`}
            className={cn(
              'flex h-18 flex-col justify-between rounded-lg px-3 py-2.5',
              TILE_TONES[index % TILE_TONES.length],
            )}
          >
            <span className="text-card-title truncate">{categoryName(category, locale)}</span>
            <span className="text-[11px] leading-4">{countLabel(category.bookCount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
