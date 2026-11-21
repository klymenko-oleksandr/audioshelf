'use client';

import {
  RiAddLine,
  RiBookOpenLine,
  RiFilter3Line,
  RiUser3Line,
  type RemixiconComponentType,
} from '@remixicon/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Item {
  key: string;
  label: string;
  href: string;
  icon: RemixiconComponentType;
  /** Not built yet: shown dimmed with a "Soon" badge, not a link. */
  soon?: boolean;
}

const ITEMS: Item[] = [
  { key: 'books', label: 'Books', href: '/admin/books', icon: RiBookOpenLine },
  { key: 'new', label: 'New book', href: '/admin/books/new', icon: RiAddLine },
  {
    key: 'categories',
    label: 'Categories',
    href: '/admin/categories',
    icon: RiFilter3Line,
    soon: true,
  },
  { key: 'listeners', label: 'Listeners', href: '/admin/listeners', icon: RiUser3Line, soon: true },
];

function isActive(pathname: string, item: Item) {
  if (item.key === 'books') {
    return (
      pathname === item.href ||
      (pathname.startsWith(`${item.href}/`) && pathname !== '/admin/books/new')
    );
  }
  return pathname === item.href;
}

/** The sidebar menu (canvas: AdminBooks). */
export function AdminNav({ bookCount }: { bookCount: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        if (item.soon) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              title="Coming later"
              className="text-muted-foreground flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-2.5 text-[13px]"
            >
              <Icon size={18} aria-hidden />
              <span className="grow">{item.label}</span>
              <Badge variant="outline">Soon</Badge>
            </span>
          );
        }
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'hover:bg-sidebar-accent flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px]',
              active && 'bg-sidebar-accent font-semibold',
            )}
          >
            <Icon
              size={18}
              aria-hidden
              className={active ? 'text-brand' : 'text-muted-foreground'}
            />
            <span className="grow">{item.label}</span>
            {item.key === 'books' && (
              <span className="text-muted-foreground text-[11px] tabular-nums">{bookCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
