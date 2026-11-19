'use client';

import { RiTimeLine } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { clearRecent, readRecent, subscribeRecent } from '../recent';
import { searchHref } from '../tabs';

const none: string[] = [];

/** The saved recent searches; empty on the server and until the browser has read them. */
export function useRecentSearches(): string[] {
  return useSyncExternalStore(subscribeRecent, readRecent, () => none);
}

/**
 * "Recent" chips (canvas: MExplore): the last eight searches on this device, one tap to run
 * one again. One line that scrolls sideways on phones, wrapping from tablets up. Renders
 * nothing when there are none.
 */
export function RecentSearches({ className }: { className?: string }) {
  const t = useTranslations('search');
  const recent = useRecentSearches();
  if (recent.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="text-muted-foreground shrink-0 text-[12px]">{t('recent')}</span>
      <ul className="-my-1 -mr-4 flex [scrollbar-width:none] gap-2 overflow-x-auto py-1 pr-4 md:mr-0 md:flex-wrap md:overflow-visible md:pr-0 [&::-webkit-scrollbar]:hidden">
        {recent.map((query) => (
          <li key={query} className="shrink-0">
            <Link
              href={searchHref(query)}
              aria-label={t('recentItem', { query })}
              className="border-border inline-flex h-8 max-w-60 items-center gap-1.5 rounded-full border px-3 text-[13px]"
            >
              <RiTimeLine size={14} aria-hidden className="shrink-0" />
              <span className="truncate">{query}</span>
            </Link>
          </li>
        ))}
        <li className="shrink-0">
          <button
            type="button"
            onClick={clearRecent}
            className="text-muted-foreground hover:text-foreground inline-flex h-8 items-center rounded-full px-2 text-[12px] font-medium"
          >
            {t('clearRecent')}
          </button>
        </li>
      </ul>
    </div>
  );
}
