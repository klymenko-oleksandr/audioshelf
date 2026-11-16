'use client';

import { RiCheckLine, RiEqualizerLine } from '@remixicon/react';
import { useTranslations } from 'next-intl';
import { formatClock } from '@/features/player/core';
import { cn } from '@/lib/utils';
import type { BookChapter } from '../data/queries';
import type { ChapterState } from '../progress';
import { ProgressLine } from './progress-line';

interface ChapterListProps {
  chapters: readonly BookChapter[];
  /** Played state per chapter, same order as `chapters`. */
  states: readonly ChapterState[];
  /** Book time, to draw how far into the current chapter the listener is. */
  position: number;
  onSelect: (chapter: BookChapter) => void;
}

/**
 * The book page's chapter list with played state (canvas: Book, MBook).
 * Wide: number · title · state · length in one line. Narrow: the progress of the current
 * chapter sits under its title. "Wide" is the width of the list itself, not the screen.
 */
export function ChapterList({ chapters, states, position, onSelect }: ChapterListProps) {
  const t = useTranslations('book');

  return (
    <ol className="@container flex flex-col">
      {chapters.map((chapter, index) => {
        const state = states[index] ?? 'upcoming';
        const current = state === 'current';
        const length = chapter.end - chapter.start;
        const within = Math.min(Math.max(position - chapter.start, 0), length);
        const pct = length > 0 ? (within / length) * 100 : 0;

        return (
          <li key={chapter.id}>
            <button
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(chapter)}
              className={cn(
                'hover:bg-accent grid min-h-13 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left',
                '@xl:min-h-11 @xl:grid-cols-[28px_minmax(0,1fr)_140px_56px] @xl:gap-4 @xl:px-3',
                current && 'bg-accent',
              )}
            >
              <span
                className={cn(
                  'flex justify-center text-[12px] tabular-nums',
                  current ? 'text-brand' : 'text-muted-foreground',
                )}
              >
                {state === 'upcoming' ? (
                  index + 1
                ) : (
                  <>
                    <span className="sr-only">{index + 1}</span>
                    {current ? (
                      <RiEqualizerLine size={16} aria-hidden />
                    ) : (
                      <RiCheckLine size={16} aria-hidden />
                    )}
                  </>
                )}
              </span>

              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    'text-[13px] leading-5',
                    current && 'text-brand font-semibold',
                    state === 'done' && 'text-muted-foreground',
                  )}
                >
                  {chapter.title}
                </span>
                {current ? <ProgressLine pct={pct} className="h-0.75 @xl:hidden" /> : null}
                {/* The narrow layout shows state by icon only; say it for screen readers. */}
                {state !== 'upcoming' ? (
                  <span className="sr-only @xl:hidden">
                    {t(current ? 'nowPlaying' : 'chapterFinished')}
                  </span>
                ) : null}
              </span>

              <span className="text-muted-foreground hidden items-center gap-2 text-[11px] @xl:flex">
                {current ? (
                  <>
                    <span className="sr-only">{t('nowPlaying')}</span>
                    <ProgressLine pct={pct} className="h-0.75 w-20 shrink-0" />
                    <span className="tabular-nums">{formatClock(within)}</span>
                  </>
                ) : state === 'done' ? (
                  t('chapterFinished')
                ) : null}
              </span>

              <span className="text-muted-foreground text-right text-[12px] tabular-nums">
                {formatClock(length)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
