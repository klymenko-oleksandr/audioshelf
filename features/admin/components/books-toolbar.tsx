'use client';

import { RiArrowUpDownLine, RiFilter3Line, RiSearchLine } from '@remixicon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  BOOK_SORTS,
  buildBooksHref,
  parseBooksQuery,
  type BooksQuery,
  type BookSort,
  type BookTab,
} from '../list-state';

const TABS: { tab: BookTab; label: string }[] = [
  { tab: 'all', label: 'All' },
  { tab: 'published', label: 'Published' },
  { tab: 'scheduled', label: 'Scheduled' },
  { tab: 'draft', label: 'Drafts' },
  { tab: 'attention', label: 'Needs attention' },
];
const SORT_LABEL: Record<BookSort, string> = { updated: 'Last updated', title: 'Title (A–Z)' };
const SEARCH_DELAY_MS = 250;

interface Props {
  query: BooksQuery;
  counts: Record<BookTab, number>;
  categories: { slug: string; name: string }[];
}

/** Status tabs, search, category filter and sort (canvas: AdminBooks). State lives in the URL. */
export function BooksToolbar({ query, counts, categories }: Props) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (change: Partial<BooksQuery>) =>
    // Replace, not push: filtering should not add Back steps.
    router.replace(buildBooksHref(query, change), { scroll: false });

  const category = categories.find((c) => c.slug === query.category);

  return (
    <div className="flex items-center gap-3">
      <nav
        aria-label="Status"
        className="bg-muted flex h-8 items-center gap-0.5 rounded-lg p-[3px]"
      >
        {TABS.map(({ tab, label }) => {
          const active = query.tab === tab;
          return (
            <Link
              key={tab}
              href={buildBooksHref(query, { tab })}
              replace
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'text-muted-foreground flex h-full items-center rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap',
                active ? 'bg-background text-foreground shadow-xs' : 'hover:text-foreground',
              )}
            >
              {label} · {counts[tab]}
            </Link>
          );
        })}
      </nav>

      <div className="grow" />

      <label className="border-input text-muted-foreground flex h-8 w-[280px] items-center gap-2 rounded-md border px-2.5 shadow-xs">
        <RiSearchLine size={16} aria-hidden />
        <input
          type="search"
          aria-label="Search books"
          placeholder="Title, author or narrator"
          defaultValue={query.q}
          onChange={(event) => {
            const q = event.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: parseBooksQuery({ q }).q }), SEARCH_DELAY_MS);
          }}
          className="text-foreground min-w-0 grow bg-transparent text-[13px] outline-none"
        />
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />} className="h-8">
          <RiFilter3Line aria-hidden />
          {category ? category.name : 'Category'}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Category</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={query.category || 'all'}
              onValueChange={(value: string) => go({ category: value === 'all' ? '' : value })}
            >
              <DropdownMenuRadioItem value="all" closeOnClick>
                All categories
              </DropdownMenuRadioItem>
              {categories.map((c) => (
                <DropdownMenuRadioItem key={c.slug} value={c.slug} closeOnClick>
                  {c.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />} className="h-8">
          <RiArrowUpDownLine aria-hidden />
          {SORT_LABEL[query.sort]}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={query.sort}
              onValueChange={(value: string) => go({ sort: value as BookSort })}
            >
              {BOOK_SORTS.map((sort) => (
                <DropdownMenuRadioItem key={sort} value={sort} closeOnClick>
                  {SORT_LABEL[sort]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
