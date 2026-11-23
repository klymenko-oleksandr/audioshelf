'use client';

import { RiMore2Fill, RiPauseFill, RiPlayFill, RiRestartLine } from '@remixicon/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { ProgressLine } from '@/features/catalogue/components/progress-line';
import { percentListened } from '@/features/catalogue/progress';
import { useDurationLabel } from '@/features/player/components/use-duration-label';
import { playBook } from '@/features/player/play-book';
import { announceLibraryChange, getPlayer, usePlayerSelector } from '@/features/player/player';
import type { LibraryEntry } from '../view/tabs';

interface HistoryRowProps {
  entry: LibraryEntry;
  /** Saved place in seconds (0 when there is none). */
  position: number;
  /** Clear the entry. The saved place goes with it. */
  onRemove(bookId: string): void;
}

/** One book in Library → History (canvas: Library rows, MLibrary): cover, place, play. */
export function HistoryRow({ entry, position, onRemove }: HistoryRowProps) {
  const t = useTranslations();
  const durationLabel = useDurationLabel();
  const { book, finished } = entry;
  const [confirming, setConfirming] = useState(false);
  // "playing" | "paused" | "" — a string, so the row re-renders only when it changes.
  const here = usePlayerSelector((state) =>
    state.book?.id !== book.id
      ? ''
      : state.status === 'playing' || state.status === 'buffering' || state.status === 'loading'
        ? 'playing'
        : 'paused',
  );
  const loaded = here !== '';

  const left = Math.max(0, book.durationSeconds - position);
  const onPlay = () => {
    if (here === 'playing') getPlayer().pause();
    else if (here === 'paused') getPlayer().play();
    else void playBook(book.id, { failed: t('book.playFailed') });
  };
  const playLabel =
    here === 'playing'
      ? t('pages.library.history.pauseLabel', { title: book.title })
      : finished && !loaded
        ? t('pages.library.history.playAgainLabel', { title: book.title })
        : t('pages.library.history.resumeLabel', { title: book.title });

  const confirmRemove = () => {
    // The place goes first: the entry's ping must not reach another tab before it.
    void getPlayer()
      .clearProgress(book.id)
      .then(() => {
        announceLibraryChange();
        onRemove(book.id);
      });
  };

  return (
    <li className="border-border relative flex flex-col gap-2 border-b py-3 first:pt-1 md:py-4">
      <div className="flex items-center gap-3 md:gap-4">
        <div className="size-16 shrink-0 rounded-md md:size-18">
          <BookCover title={book.title} src={book.coverUrl} seed={book.slug} />
        </div>
        <div className="flex min-w-0 grow flex-col gap-1">
          <Link
            href={`/book/${book.slug}`}
            className="line-clamp-2 text-[14px] leading-5 font-semibold after:absolute after:inset-0 focus-visible:shadow-none"
          >
            {book.title}
          </Link>
          {book.author ? (
            <span className="text-muted-foreground truncate text-[12px] leading-4">
              {book.author.name}
            </span>
          ) : null}
          {finished ? (
            <span className="text-muted-foreground text-[11px] leading-4 font-medium">
              {t('pages.library.history.finished')}
            </span>
          ) : (
            <div className="flex items-center gap-2.5">
              <ProgressLine pct={percentListened(position, book.durationSeconds)} />
              <span className="text-muted-foreground text-[11px] leading-4 whitespace-nowrap tabular-nums">
                {t('pages.library.history.left', { duration: durationLabel(left) })}
              </span>
            </div>
          )}
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPlay}
            aria-label={playLabel}
            className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full md:size-9"
          >
            {here === 'playing' ? (
              <RiPauseFill size={18} aria-hidden />
            ) : finished && !loaded ? (
              <RiRestartLine size={18} aria-hidden />
            ) : (
              <RiPlayFill size={18} aria-hidden />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-11 md:size-8" />}
              aria-label={t('pages.library.history.more', { title: book.title })}
            >
              <RiMore2Fill aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-52">
              <DropdownMenuItem disabled={here === 'playing'} onClick={() => setConfirming(true)}>
                {t('pages.library.history.remove')}
              </DropdownMenuItem>
              {here === 'playing' ? (
                <p className="text-muted-foreground max-w-56 px-2 py-1 text-[11px] leading-4">
                  {t('pages.library.history.removeWhilePlaying')}
                </p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {confirming ? (
        <div
          role="group"
          aria-label={t('pages.library.history.remove')}
          className="bg-muted relative flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
        >
          <span className="text-[13px] leading-5">{t('pages.library.history.confirm')}</span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              {t('pages.library.history.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmRemove}>
              {t('pages.library.history.confirmRemove')}
            </Button>
          </span>
        </div>
      ) : null}
    </li>
  );
}
