'use client';

import { RiHeartFill, RiHeartLine, RiPlayFill } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { ProgressLine } from '@/features/catalogue/components/progress-line';
import type { SearchBook } from '@/features/catalogue/data';
import { chapterIndexFor, percentListened } from '@/features/catalogue/progress';
import { useBookFlags } from '@/features/library/flags/use-library-flags';
import { useDurationLabel } from '@/features/player/components/use-duration-label';
import { playBook } from '@/features/player/play-book';
import { useBookProgress } from '@/features/player/player';
import { addRecent } from '../recent';

/**
 * Wraps the results: following any link in them (a book, an author, a narrator) counts as
 * having searched for the query, so the query shows up under "Recent".
 */
export function RecordSearch({ query, children }: { query: string; children: ReactNode }) {
  return (
    <div
      onClickCapture={(event) => {
        if ((event.target as Element).closest('a')) addRecent(query);
      }}
    >
      {children}
    </div>
  );
}

/** The heart on a result row (canvas: Search, MSearchResults): filled and green when liked. */
export function RowLikeButton({ bookId }: { bookId: string }) {
  const t = useTranslations('bookCard');
  const { liked, toggleLike } = useBookFlags(bookId);
  const Heart = liked ? RiHeartFill : RiHeartLine;
  return (
    <button
      type="button"
      aria-label={t(liked ? 'unlike' : 'like')}
      aria-pressed={liked}
      onClick={toggleLike}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full md:size-8',
        liked ? 'text-brand' : 'text-muted-foreground',
      )}
    >
      <Heart size={20} aria-hidden className="md:size-[18px]" />
    </button>
  );
}

/**
 * The best match (canvas: Search "Top result", MSearchResults). Wide: a card with a large
 * cover and a Play / Resume button. Narrow: a compact row with a round play button.
 * Progress comes from this device, so the card is filled in in the browser.
 */
export function TopResult({
  book,
  chapterStarts,
}: {
  book: SearchBook;
  chapterStarts: readonly number[];
}) {
  const t = useTranslations();
  const durationLabel = useDurationLabel();
  const progress = useBookProgress(book.id);

  const started = !!progress && !progress.finished && progress.position > 0;
  const pct = started ? percentListened(progress.position, book.durationSeconds) : 0;
  const chapter = started ? chapterIndexFor(chapterStarts, progress.position) : -1;
  const author = book.author?.name ?? '';
  const play = () => void playBook(book.id, { failed: t('book.playFailed') });

  return (
    <article className="bg-card border-border outline-foreground relative flex items-center gap-3 rounded-xl border p-3 shadow-sm outline-offset-2 has-[a:focus-visible]:outline-2 md:flex-col md:items-stretch md:gap-4 md:rounded-xl md:p-5">
      <div className="flex min-w-0 grow items-center gap-3 md:items-end md:gap-4">
        <div className="size-18 shrink-0 rounded-md md:size-32 md:rounded-lg">
          <BookCover title={book.title} author={author} seed={book.slug} />
        </div>
        <div className="flex min-w-0 flex-col gap-1 md:gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase md:hidden">
            {t('search.topResult')}
          </span>
          {/* The link covers the whole card; the play button sits above it. */}
          <Link
            href={`/book/${book.slug}`}
            className="font-heading line-clamp-3 text-[14px] leading-[19px] font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:shadow-none md:text-[22px] md:leading-[26px] md:tracking-[-0.01em]"
          >
            {book.title}
          </Link>
          <span className="text-muted-foreground hidden truncate text-[12px] md:block">
            {[author, durationLabel(book.durationSeconds)].filter(Boolean).join(' · ')}
          </span>
          <span className="text-muted-foreground text-[12px] md:hidden">
            {started
              ? [
                  `${pct}%`,
                  chapter >= 0
                    ? t('pages.home.chapterOf', {
                        number: chapter + 1,
                        count: chapterStarts.length,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : durationLabel(book.durationSeconds)}
          </span>
          {started ? <ProgressLine pct={pct} className="mt-0.5 md:hidden" /> : null}
        </div>
      </div>

      {/* Narrow: a round button. */}
      <button
        type="button"
        onClick={play}
        aria-label={t(started ? 'bookCard.resume' : 'bookCard.play', { title: book.title })}
        className="bg-primary text-primary-foreground relative grid size-11 shrink-0 place-items-center rounded-full md:hidden"
      >
        <RiPlayFill size={20} aria-hidden />
      </button>

      {/* Wide: a labelled button and the percentage. */}
      <div className="hidden items-center gap-3 md:flex">
        <button
          type="button"
          onClick={play}
          className="bg-primary text-primary-foreground relative inline-flex h-8 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium"
        >
          <RiPlayFill size={16} aria-hidden />
          {started && chapter >= 0
            ? t('search.resumeChapter', { number: chapter + 1 })
            : t(started ? 'book.resume' : 'search.playShort')}
        </button>
        {started ? (
          <span className="text-muted-foreground text-[12px]">{t('search.listened', { pct })}</span>
        ) : null}
      </div>
    </article>
  );
}
