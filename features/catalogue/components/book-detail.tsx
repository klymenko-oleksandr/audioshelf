'use client';

import {
  RiDownload2Line,
  RiHeartLine,
  RiPauseFill,
  RiPlayFill,
  RiPlayListAddLine,
  RiShareForwardLine,
} from '@remixicon/react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useDurationLabel } from '@/features/player/components/use-duration-label';
import { chapterIndexAt, formatClock, isFinished } from '@/features/player/core';
import { playBook } from '@/features/player/play-book';
import { getPlayer, useBookProgress, usePlayerState } from '@/features/player/player';
import { useShare } from '@/features/share/share';
import { cn } from '@/lib/utils';
import { parseBookTab, type BookTab } from '../book-tabs';
import type { BookDetail as BookDetailData } from '../data/queries';
import { categoryName, isBookLanguage } from '../names';
import { chapterStates, percentListened } from '../progress';
import { BookCover } from './book-cover';
import { ChapterList } from './chapter-list';
import { ProgressLine } from './progress-line';

const underlined = 'underline underline-offset-3';

/**
 * The book page (canvas: Book, MBook): header with cover, facts and actions, then the
 * chapter list and About.
 *
 * Layout follows the width of the page area, not the screen (container queries): the header
 * stacks and centres when narrow; About is a tab when narrow and a side column when wide.
 *
 * It gets the page data (no tracks). Pressing Play or a chapter loads the tracks.
 * Like, Listen later, Download and Reviews are not built yet and say so.
 */
export function BookDetail({ book, initialTab }: { book: BookDetailData; initialTab: BookTab }) {
  const t = useTranslations('book');
  const tBadge = useTranslations('nav');
  const locale = useLocale();
  const durationLabel = useDurationLabel();
  const state = usePlayerState();
  const saved = useBookProgress(book.id);
  const [tab, setTab] = useState<BookTab>(initialTab);

  const current = state.book?.id === book.id;
  const playingHere =
    current &&
    (state.status === 'playing' || state.status === 'buffering' || state.status === 'loading');
  const duration = book.durationSeconds;
  const position = Math.min(current ? state.position : (saved?.position ?? 0), duration);
  // Ongoing books are never saved as finished: reaching the end means "up to date".
  const atEnd =
    (current && state.status === 'finished') ||
    (saved?.finished ?? false) ||
    isFinished(position, duration);
  const started = position > 0 && !atEnd;
  const chapterIndex = current
    ? state.chapterIndex
    : started
      ? chapterIndexAt(book.chapters, position)
      : -1;
  const activeChapter = book.chapters[chapterIndex];
  const states = chapterStates(book.chapters.length, chapterIndex, atEnd && !current);
  const pct = percentListened(position, duration);
  const author = book.author?.name ?? '';
  const failed = { failed: t('playFailed') };
  const soon = () => toast({ title: t('comingSoon') });
  const share = useShare();
  const onShare = () => share({ title: book.title, path: `/book/${book.slug}` });

  const onMain = () => {
    if (playingHere) getPlayer().pause();
    else if (current && state.status !== 'finished') getPlayer().play();
    else void playBook(book.id, failed);
  };
  const onTab = (next: BookTab) => {
    setTab(next);
    // The tab is part of the URL (shareable, survives a reload) without adding history.
    const url = new URL(window.location.href);
    if (next === 'chapters') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const mainLabel = playingHere
    ? t('pause')
    : atEnd
      ? t('playAgain')
      : started && activeChapter
        ? t('resumeAt', {
            number: chapterIndex + 1,
            time: formatClock(position - activeChapter.start),
          })
        : started
          ? t('resume')
          : t('play');

  const facts: ReactNode[] = [
    book.narrator ? t('readBy', { name: book.narrator.name }) : null,
    durationLabel(duration),
    t('chapterCount', { count: book.chapters.length }),
  ].filter(Boolean);

  const about = (
    <p
      className={cn(
        'max-w-prose text-[13px] leading-[21px] whitespace-pre-line',
        book.description ? 'text-muted-foreground' : 'text-muted-foreground italic',
      )}
    >
      {book.description || t('noDescription')}
    </p>
  );

  return (
    <div className="@container flex flex-col gap-5 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7 lg:pb-10">
      <section className="flex flex-col items-center gap-4 text-center @2xl:flex-row @2xl:items-end @2xl:gap-8 @2xl:text-left">
        <div className="w-44 shrink-0 rounded-xl shadow-sm @2xl:w-58">
          <BookCover
            title={book.title}
            author={author}
            src={book.coverLargeUrl ?? book.coverUrl}
            seed={book.slug}
          />
        </div>

        <div className="flex w-full min-w-0 grow flex-col items-center gap-3 @2xl:items-start">
          <div className="flex flex-wrap justify-center gap-1.5 @2xl:justify-start">
            {book.category ? (
              <Badge variant="secondary" render={<Link href={`/category/${book.category.slug}`} />}>
                {categoryName(book.category, locale)}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {isBookLanguage(book.language)
                ? t(`language.${book.language}`)
                : book.language.toUpperCase()}
            </Badge>
            {book.ongoing ? <Badge variant="outline">{t('ongoing')}</Badge> : null}
          </div>

          <h1 className="font-heading text-[24px] leading-7 font-bold tracking-[-0.02em] text-balance @2xl:text-[40px] @2xl:leading-11 @2xl:tracking-[-0.03em]">
            {book.title}
          </h1>

          <p className="text-muted-foreground text-[12px] leading-[18px] @2xl:text-[13px]">
            {book.author ? (
              <>
                <Link
                  href={`/author/${book.author.slug}`}
                  className={cn('text-foreground rounded-sm font-medium', underlined)}
                >
                  {book.author.name}
                </Link>
                {' · '}
              </>
            ) : null}
            {facts.map((fact, index) => (
              <span key={index}>
                {index > 0 ? ' · ' : null}
                {fact}
              </span>
            ))}
          </p>

          {started ? (
            <div className="flex w-full flex-col gap-1.5 @2xl:max-w-120 @2xl:flex-row @2xl:items-center @2xl:gap-3">
              <ProgressLine pct={pct} />
              <span className="text-muted-foreground text-left text-[11px] whitespace-nowrap @2xl:text-[12px]">
                {t('progress', {
                  pct,
                  left: durationLabel(Math.max(0, duration - position)),
                })}
              </span>
            </div>
          ) : atEnd ? (
            <p className="text-muted-foreground text-[12px]">
              {book.ongoing ? t('upToDate') : t('finished')}
            </p>
          ) : null}

          <div className="flex w-full flex-col gap-3 pt-1 @2xl:flex-row @2xl:flex-wrap @2xl:items-center @2xl:gap-2">
            <Button
              size="lg"
              onClick={onMain}
              className="h-12 w-full gap-2 px-4 text-[15px] @2xl:h-9 @2xl:w-fit @2xl:gap-1.5 @2xl:px-3 @2xl:text-sm"
            >
              {playingHere ? <RiPauseFill aria-hidden /> : <RiPlayFill aria-hidden />}
              {mainLabel}
            </Button>

            {/* Wide: outline buttons beside Play (canvas: Book). */}
            <div className="hidden flex-wrap items-center gap-2 @2xl:flex">
              <Button variant="outline" size="icon-lg" aria-label={t('like')} onClick={soon}>
                <RiHeartLine aria-hidden />
              </Button>
              <Button variant="outline" size="lg" onClick={soon}>
                <RiPlayListAddLine aria-hidden />
                {t('listenLater')}
              </Button>
              <Button variant="outline" size="lg" onClick={soon}>
                <RiDownload2Line aria-hidden />
                {t('download')}
              </Button>
              <Button variant="ghost" size="icon-lg" aria-label={t('share')} onClick={onShare}>
                <RiShareForwardLine aria-hidden />
              </Button>
            </div>

            {/* Narrow: four icon buttons with captions under Play (canvas: MBook). */}
            <div className="flex justify-between @2xl:hidden">
              {(
                [
                  [RiHeartLine, t('like'), soon],
                  [RiPlayListAddLine, t('laterShort'), soon],
                  [RiDownload2Line, t('offlineShort'), soon],
                  [RiShareForwardLine, t('share'), onShare],
                ] as const
              ).map(([Icon, label, onClick]) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="text-muted-foreground flex min-h-14 w-18 flex-col items-center gap-0.5 rounded-md py-1 text-[11px]"
                >
                  <Icon size={24} aria-hidden className="text-foreground" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-4 pb-2">
            <Tabs value={tab} onValueChange={(value) => onTab(parseBookTab(String(value)))}>
              <TabsList aria-label={t('sections')}>
                <TabsTrigger value="chapters" id="tab-chapters" aria-controls="panel-chapters">
                  {t('chaptersTab', { count: book.chapters.length })}
                </TabsTrigger>
                {/* Wide layouts show About beside the chapters, so its tab goes away. */}
                <TabsTrigger
                  value="about"
                  id="tab-about"
                  aria-controls="panel-about"
                  className="@4xl:hidden"
                >
                  {t('about')}
                </TabsTrigger>
                <TabsTrigger value="reviews" disabled>
                  {t('reviews')}
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    {tBadge('soon')}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-muted-foreground hidden text-[12px] @2xl:block">
              {durationLabel(duration)}
            </span>
          </div>

          <div
            id="panel-chapters"
            role="tabpanel"
            aria-labelledby="tab-chapters"
            className={cn(tab !== 'chapters' && 'hidden @4xl:block')}
          >
            <ChapterList
              chapters={book.chapters}
              states={states}
              position={position}
              onSelect={(chapter) => void playBook(book.id, failed, chapter.start)}
            />
          </div>
          <div
            id="panel-about"
            role="tabpanel"
            aria-labelledby="tab-about"
            className={cn('px-2', tab === 'about' ? '@4xl:hidden' : 'hidden')}
          >
            {about}
          </div>
        </section>

        <aside className="hidden flex-col gap-2 @4xl:flex">
          <h2 className="text-h4">{t('about')}</h2>
          {about}
        </aside>
      </div>
    </div>
  );
}
