'use client';

import { RiPauseFill, RiPlayFill } from '@remixicon/react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatClock, isFinished } from '@/features/player/core';
import { playBook } from '@/features/player/play-book';
import { getPlayer, useBookProgress, usePlayerState } from '@/features/player/player';
import { cn } from '@/lib/utils';
import type { BookDetail as BookDetailData } from '../data/queries';
import { BookCover } from './book-cover';

/**
 * The book page body: cover, Play / Resume / Play again, description and the chapter list.
 * Still the plain Phase 2 layout; the canvas version (tabs, About, actions) comes next.
 *
 * It gets the page data (no tracks). Pressing Play or a chapter loads the tracks.
 */
export function BookDetail({ book }: { book: BookDetailData }) {
  const t = useTranslations('book');
  const state = usePlayerState();
  const saved = useBookProgress(book.id);

  const current = state.book?.id === book.id;
  const playingHere =
    current &&
    (state.status === 'playing' || state.status === 'buffering' || state.status === 'loading');
  const position = current ? state.position : (saved?.position ?? 0);
  const duration = book.durationSeconds;
  const author = book.author?.name ?? '';
  const failed = { failed: t('playFailed') };
  const finished = saved?.finished ?? isFinished(position, duration);
  const started = position > 0 && !finished;
  const activeChapter = current ? state.chapterIndex : -1;

  const player = () => getPlayer();
  const onMain = () => {
    if (playingHere) player().pause();
    else if (current && state.status !== 'finished') player().play();
    else void playBook(book.id, failed);
  };

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-40 shrink-0 rounded-xl shadow-sm sm:w-48">
          <BookCover
            title={book.title}
            author={author}
            src={book.coverLargeUrl ?? book.coverUrl}
            seed={book.slug}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-h3 md:text-h2 text-balance">{book.title}</h1>
          <p className="text-muted-foreground">
            {[author, formatClock(duration)].filter(Boolean).join(' · ')}
          </p>
          <Button size="lg" className="mt-2 w-fit px-4" onClick={onMain}>
            {playingHere ? <RiPauseFill aria-hidden /> : <RiPlayFill aria-hidden />}
            {playingHere
              ? t('pause')
              : finished
                ? t('playAgain')
                : started
                  ? t('resume')
                  : t('play')}
          </Button>
        </div>
      </div>

      {book.description ? (
        <p className="text-muted-foreground max-w-prose whitespace-pre-line">{book.description}</p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-h4">{t('chapters')}</h2>
        <ol className="border-border flex flex-col border-t">
          {book.chapters.map((chapter, index) => (
            <li key={chapter.id} className="border-border border-b">
              <button
                type="button"
                aria-current={index === activeChapter ? 'true' : undefined}
                onClick={() => void playBook(book.id, failed, chapter.start)}
                className={cn(
                  'hover:bg-accent flex min-h-11 w-full items-center gap-3 px-2 py-2 text-left',
                  index === activeChapter && 'font-semibold',
                )}
              >
                <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 grow">{chapter.title}</span>
                {index === activeChapter ? (
                  <span className="text-brand text-caption shrink-0">{t('nowPlaying')}</span>
                ) : null}
                <span className="text-muted-foreground shrink-0 tabular-nums">
                  {formatClock(chapter.end - chapter.start)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
