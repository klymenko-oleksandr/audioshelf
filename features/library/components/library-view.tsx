'use client';

import { RiBookOpenLine } from '@remixicon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookGrid } from '@/features/catalogue/components/book-grid';
import { useAllProgress } from '@/features/player/player';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { useLibraryFlags } from '../flags/use-library-flags';
import { useLibraryHistory } from '../history/use-library-history';
import {
  buildLibraryView,
  defaultSort,
  libraryHref,
  LIBRARY_TABS,
  type LibrarySort,
  type LibraryTab,
} from '../view/tabs';
import { HistoryRow } from './history-row';
import { SortControl } from './sort-control';
import { useLibraryBooks } from './use-library-books';

function EmptyState({ tab }: { tab: LibraryTab }) {
  const t = useTranslations('pages.library');
  return (
    <div
      data-testid={`library-empty-${tab}`}
      className="flex flex-col items-center gap-3 px-4 py-16 text-center"
    >
      <RiBookOpenLine aria-hidden size={32} className="text-muted-foreground" />
      <h2 className="font-heading text-[18px] leading-6 font-semibold">
        {t(`empty.${tab}.title`)}
      </h2>
      <p className="text-muted-foreground max-w-sm text-[14px] leading-5">
        {t(`empty.${tab}.body`)}
      </p>
      <Link href="/explore" className={buttonVariants({ variant: 'default', size: 'lg' })}>
        {t('empty.explore')}
      </Link>
    </div>
  );
}

function ListSkeleton({ tab, label }: { tab: LibraryTab; label: string }) {
  return (
    <div aria-busy="true" className="loader-delay flex flex-col gap-4">
      <span role="status" className="sr-only">
        {label}
      </span>
      {tab === 'history' ? (
        Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-16 shrink-0 rounded-md" />
            <div className="flex grow flex-col gap-2">
              <Skeleton className="h-3.5 w-[60%]" />
              <Skeleton className="h-3 w-[35%]" />
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-3 gap-y-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Library (canvas: Library, MLibrary): Liked · Listen later · History for this device. The
 * ids come from Dexie (`useLibraryFlags`, `useLibraryHistory`), the books from the catalogue;
 * ids the catalogue no longer has are skipped, in the lists and in the counts.
 */
export function LibraryView({ tab, sort }: { tab: LibraryTab; sort: LibrarySort }) {
  const t = useTranslations('pages.library');
  const router = useRouter();
  const flags = useLibraryFlags();
  const history = useLibraryHistory();
  const progress = useAllProgress();

  const ready = flags.ready && history.ready && progress !== undefined;
  const ids = useMemo(
    () =>
      ready
        ? [
            ...new Set([
              ...flags.likedIds,
              ...flags.listenLaterIds,
              ...history.entries.map((entry) => entry.bookId),
            ]),
          ]
        : [],
    [ready, flags.likedIds, flags.listenLaterIds, history.entries],
  );
  const { books, status, retry } = useLibraryBooks(ids);

  const view = useMemo(
    () =>
      buildLibraryView({
        likedAt: flags.likedAt,
        listenLaterAt: flags.listenLaterAt,
        history: history.entries,
        books,
        sorts: {
          liked: defaultSort('liked'),
          listenLater: defaultSort('listenLater'),
          history: defaultSort('history'),
          [tab]: sort,
        },
      }),
    [flags.likedAt, flags.listenLaterAt, history.entries, books, tab, sort],
  );
  const positions = useMemo(
    () => new Map((progress ?? []).map((record) => [record.bookId, record.position])),
    [progress],
  );

  const settled = ready && status === 'ready';
  const showSkeleton = useDelayedLoading(!settled && status !== 'error');
  const entries = view[tab];

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
          {t('title')}
        </h1>
        <p className="text-muted-foreground hidden text-[14px] md:block">{t('subtitle')}</p>
      </header>

      <div className="flex items-center justify-between gap-2">
        <Tabs
          className="min-w-0 overflow-x-auto"
          value={tab}
          onValueChange={(value) =>
            router.replace(libraryHref(value as LibraryTab, defaultSort(value as LibraryTab)), {
              scroll: false,
            })
          }
        >
          <TabsList variant="line" aria-label={t('tabsLabel')}>
            {LIBRARY_TABS.map((name) => (
              <TabsTrigger key={name} value={name} className="px-2 md:px-3">
                {t(`tabs.${name}`)}
                {settled ? (
                  <span
                    data-testid={`library-count-${name}`}
                    className="text-muted-foreground text-[12px] tabular-nums"
                  >
                    {view[name].length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {entries.length > 1 ? <SortControl tab={tab} sort={sort} /> : null}
      </div>

      {status === 'error' ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-[14px]">{t('loadFailed')}</p>
          <Button variant="outline" onClick={retry}>
            {t('retry')}
          </Button>
        </div>
      ) : !settled && entries.length === 0 ? (
        showSkeleton ? (
          <ListSkeleton tab={tab} label={t('loading')} />
        ) : null
      ) : entries.length === 0 ? (
        <EmptyState tab={tab} />
      ) : tab === 'history' ? (
        <ul data-testid="library-history">
          {entries.map((entry) => (
            <HistoryRow
              key={entry.book.id}
              entry={entry}
              position={positions.get(entry.book.id) ?? 0}
              onRemove={(bookId) => void history.remove(bookId)}
            />
          ))}
        </ul>
      ) : (
        <BookGrid books={entries.map((entry) => entry.book)} />
      )}
    </div>
  );
}
