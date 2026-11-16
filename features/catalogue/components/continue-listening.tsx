'use client';

import { RiPauseFill, RiPlayFill } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useDurationLabel } from '@/features/player/components/use-duration-label';
import { isFinished } from '@/features/player/core';
import { playBook } from '@/features/player/play-book';
import { getPlayer, useAllProgress, usePlayerSelector } from '@/features/player/player';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { cn } from '@/lib/utils';
import { knownContinueBooks, loadContinueBooks } from '../data/continue-books';
import type { ContinueBook } from '../data/queries';
import { chapterIndexFor, percentListened, pickContinue } from '../progress';
import { BookCover } from './book-cover';
import { HomeSection, rowScroller } from './book-row';
import { ProgressLine } from './progress-line';

/** How many books the row shows; the rest are in Library → History (Phase 5). */
const MAX_BOOKS = 6;

const rowLayout = cn(
  rowScroller,
  'gap-3 md:mx-0 md:my-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] md:gap-4 md:overflow-visible md:p-0',
);
const cardBox =
  'border-border flex w-75 shrink-0 snap-start gap-3 rounded-xl border p-3 md:w-auto md:gap-3.5';

function ContinueCard({ book, position }: { book: ContinueBook; position: number }) {
  const t = useTranslations();
  const durationLabel = useDurationLabel();
  // "playing" | "paused" | "" — a string, so the card re-renders only when it changes.
  const here = usePlayerSelector((state) =>
    state.book?.id !== book.id
      ? ''
      : state.status === 'playing' || state.status === 'buffering' || state.status === 'loading'
        ? 'playing'
        : 'paused',
  );

  const chapter = chapterIndexFor(book.chapterStarts, position);
  const left = Math.max(0, book.durationSeconds - position);
  const onPlay = () => {
    if (here === 'playing') getPlayer().pause();
    else if (here === 'paused') getPlayer().play();
    else void playBook(book.id, { failed: t('book.playFailed') });
  };

  return (
    <article
      className={cn(
        cardBox,
        'bg-card outline-foreground relative shadow-sm outline-offset-2 has-[a:focus-visible]:outline-2',
      )}
    >
      <div className="size-18 shrink-0 rounded-md md:size-24">
        <BookCover title={book.title} src={book.coverUrl} seed={book.slug} />
      </div>
      <div className="flex min-w-0 grow flex-col gap-1">
        {/* The link covers the whole card; the play button sits above it. */}
        <Link
          href={`/book/${book.slug}`}
          className="line-clamp-2 text-[13px] leading-[18px] font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:shadow-none"
        >
          {book.title}
        </Link>
        {book.author ? (
          <span className="text-muted-foreground hidden truncate text-[12px] leading-4 md:block">
            {book.author.name}
          </span>
        ) : null}
        <span className="grow" />
        {chapter >= 0 ? (
          <span className="text-muted-foreground truncate text-[11px] leading-4">
            {t('pages.home.chapterOf', { number: chapter + 1, count: book.chapterStarts.length })}
          </span>
        ) : null}
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2.5">
          <ProgressLine pct={percentListened(position, book.durationSeconds)} />
          <span className="text-muted-foreground text-[11px] leading-4 whitespace-nowrap tabular-nums">
            {t('player.timeLeft', { duration: durationLabel(left) })}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onPlay}
        aria-label={
          here === 'playing'
            ? t('pages.home.pauseBook', { title: book.title })
            : t('bookCard.resume', { title: book.title })
        }
        className="bg-primary text-primary-foreground relative grid size-11 shrink-0 place-items-center self-center rounded-full md:size-9"
      >
        {here === 'playing' ? (
          <RiPauseFill size={18} aria-hidden />
        ) : (
          <RiPlayFill size={18} aria-hidden />
        )}
      </button>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className={cardBox}>
      <Skeleton className="size-18 shrink-0 md:size-24" />
      <div className="flex grow flex-col gap-2">
        <Skeleton className="h-3.5 w-[90%]" />
        <Skeleton className="h-3 w-[60%]" />
        <span className="grow" />
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
    </div>
  );
}

/**
 * Home → "Continue listening" (canvas: Main, MHome): books started on this device and not
 * finished, most recent first. Hidden when there are none.
 *
 * Progress lives on the device (guests, and everyone until sync in Phase 6), so the row is
 * filled in the browser: saved positions first, then the books' card data from the server.
 */
export function ContinueListening() {
  const t = useTranslations('pages.home');
  const progress = useAllProgress();
  const picked = useMemo(() => pickContinue(progress ?? [], MAX_BOOKS), [progress]);
  const idsKey = picked.map((record) => record.bookId).join(',');

  // Bumped when a request settles, to read the freshly filled cache.
  const [, setSettled] = useState(0);
  const [failed, setFailed] = useState(false);
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const books = knownContinueBooks(ids);

  useEffect(() => {
    if (ids.length === 0 || knownContinueBooks(ids)) return;
    let cancelled = false;
    loadContinueBooks(ids)
      .then(() => !cancelled && setSettled((n) => n + 1))
      // Offline or a server error: no row rather than a broken one; Home still works.
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const loading = ids.length > 0 && !books && !failed;
  const showSkeleton = useDelayedLoading(loading);

  const cards = picked.flatMap((record) => {
    const book = books?.get(record.bookId);
    // An ongoing book listened to the end is "up to date" until new parts arrive.
    if (!book || isFinished(record.position, book.durationSeconds)) return [];
    return [{ book, position: Math.min(record.position, book.durationSeconds) }];
  });

  if (cards.length === 0 && !showSkeleton) return null;

  return (
    <HomeSection
      id="continue-listening"
      title={t('continueListening')}
      link={{ href: '/library', label: t('seeAll') }}
    >
      {cards.length > 0 ? (
        <div className={rowLayout}>
          {cards.map(({ book, position }) => (
            <ContinueCard key={book.id} book={book} position={position} />
          ))}
        </div>
      ) : (
        <div className={rowLayout} aria-busy="true">
          {ids.slice(0, 3).map((id) => (
            <CardSkeleton key={id} />
          ))}
        </div>
      )}
    </HomeSection>
  );
}
