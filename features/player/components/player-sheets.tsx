'use client';

import { RiAddLine, RiCloseLine, RiSubtractLine, RiVolumeUpFill } from '@remixicon/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import {
  formatClock,
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  SLEEP_MINUTE_OPTIONS,
  SPEED_PRESETS,
  stepSpeed,
} from '../core';
import { getPlayer, usePlayerState } from '../player';
import { closeSheet, useOpenSheet, type PlayerSheet } from '../ui/player-ui';
import { useDurationLabel } from './use-duration-label';

/** From 768 px the sheet is a centred card instead of a full-width drawer. */
const CARD = 'md:mx-auto md:mb-6 md:max-w-md md:rounded-[20px]';

function SheetShell({
  which,
  title,
  note,
  children,
}: {
  which: PlayerSheet;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  const t = useTranslations('player');
  const open = useOpenSheet() === which;

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSheet();
      }}
      title={title}
      className={CARD}
      header={
        <div className="flex items-center gap-3 pt-2">
          <div className="flex min-w-0 grow flex-col">
            <span aria-hidden className="text-h4">
              {title}
            </span>
            {note ? (
              <span className="text-brand text-[13px] tabular-nums" data-testid="sheet-note">
                {note}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={t('closeSheet')}
            onClick={closeSheet}
            className="hover:bg-accent grid size-11 shrink-0 place-items-center rounded-full"
          >
            <RiCloseLine size={22} aria-hidden />
          </button>
        </div>
      }
    >
      {children}
    </BottomSheet>
  );
}

/** Canvas: MSpeedSheet. 0.5–3×, ±0.1 buttons, a slider and six presets. */
function SpeedSheet() {
  const t = useTranslations('player');
  const { speed } = usePlayerState();
  const fraction = (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);

  const round =
    'border-border hover:bg-accent grid size-11 place-items-center rounded-full border disabled:opacity-40';

  return (
    <SheetShell which="speed" title={t('speed')}>
      <div className="flex items-center justify-center gap-6 py-3">
        <button
          type="button"
          aria-label={t('speedSlower')}
          disabled={speed <= MIN_SPEED}
          onClick={() => getPlayer().setSpeed(stepSpeed(speed, -1))}
          className={round}
        >
          <RiSubtractLine size={20} aria-hidden />
        </button>
        <output className="font-heading min-w-32 text-center text-5xl font-semibold tabular-nums">
          {formatSpeed(speed)}
        </output>
        <button
          type="button"
          aria-label={t('speedFaster')}
          disabled={speed >= MAX_SPEED}
          onClick={() => getPlayer().setSpeed(stepSpeed(speed, 1))}
          className={round}
        >
          <RiAddLine size={20} aria-hidden />
        </button>
      </div>

      <input
        type="range"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={0.05}
        value={speed}
        aria-label={t('speedShort')}
        aria-valuetext={formatSpeed(speed)}
        onChange={(event) => getPlayer().setSpeed(Number(event.target.value))}
        style={{ '--scrub': `${fraction * 100}%` } as React.CSSProperties}
        className="scrubber scrubber-lg w-full"
      />
      <div aria-hidden className="text-muted-foreground relative h-4 text-[11px] tabular-nums">
        {[0.5, 1, 2, 3].map((mark) => (
          <span
            key={mark}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${((mark - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100}%` }}
          >
            {formatSpeed(mark)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-1.5 pt-3">
        {SPEED_PRESETS.map((preset) => {
          const active = Math.abs(preset - speed) < 0.001;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => getPlayer().setSpeed(preset)}
              className={cn(
                'h-11 rounded-md border text-[13px] font-medium tabular-nums',
                active
                  ? 'bg-primary text-primary-foreground border-transparent'
                  : 'border-border hover:bg-accent',
              )}
            >
              {formatSpeed(preset)}
            </button>
          );
        })}
      </div>
    </SheetShell>
  );
}

/** Canvas: MSleepSheet. The fade is a fixed 10 s (PRD), so there is no fade switch. */
function SleepSheet() {
  const t = useTranslations('player');
  const { sleep, book, chapterIndex, position, speed } = usePlayerState();
  const duration = useDurationLabel();

  const chapter = book?.chapters[chapterIndex];
  const selected =
    sleep === null ? 'off' : sleep.timer.kind === 'minutes' ? sleep.timer.minutes : 'chapter';
  const choose = (option: number | 'chapter' | null) => {
    getPlayer().setSleepTimer(option);
    closeSheet();
  };

  const row = (
    key: string | number,
    label: string,
    note: string | undefined,
    onSelect: () => void,
  ) => {
    const checked = selected === key;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onSelect}
        className="border-border flex min-h-12 items-center gap-3 border-b px-1 text-left last:border-b-0"
      >
        <span
          aria-hidden
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border-2',
            checked ? 'border-primary' : 'border-border',
          )}
        >
          {checked ? <span className="bg-primary size-2.5 rounded-full" /> : null}
        </span>
        <span className="grow">{label}</span>
        {note ? <span className="text-muted-foreground text-[13px]">{note}</span> : null}
      </button>
    );
  };

  return (
    <SheetShell
      which="sleep"
      title={t('sleepTimer')}
      note={
        sleep
          ? t('sleepStopsIn', { time: formatClock(Math.ceil(sleep.remainingMs / 1000)) })
          : undefined
      }
    >
      <div role="radiogroup" aria-label={t('sleepGroup')} className="flex flex-col">
        {row('off', t('sleepOff'), undefined, () => choose(null))}
        {SLEEP_MINUTE_OPTIONS.map((minutes) =>
          row(minutes, t('sleepMinutes', { minutes }), undefined, () => choose(minutes)),
        )}
        {chapter
          ? row(
              'chapter',
              t('sleepEndOfChapter'),
              t('timeLeft', { duration: duration(Math.max(60, (chapter.end - position) / speed)) }),
              () => choose('chapter'),
            )
          : null}
      </div>
    </SheetShell>
  );
}

/** Canvas: MChapters (the Bookmarks and Text tabs come with those features). */
function ChaptersSheet() {
  const t = useTranslations('player');
  const { book, chapterIndex, position, duration: total, speed } = usePlayerState();
  const duration = useDurationLabel();
  const open = useOpenSheet() === 'chapters';
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) current.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  if (!book) return null;

  return (
    <SheetShell which="chapters" title={t('chapters')}>
      <p className="text-muted-foreground text-[13px]">
        {[
          t('chapterCount', { count: book.chapters.length }),
          duration(total),
          t('timeLeft', { duration: duration((total - position) / speed) }),
        ].join(' · ')}
      </p>
      <ol className="flex flex-col">
        {book.chapters.map((chapter, index) => {
          const active = index === chapterIndex;
          const length = chapter.end - chapter.start;
          const pct = active && length > 0 ? ((position - chapter.start) / length) * 100 : 0;
          return (
            <li key={chapter.id} className="border-border border-b last:border-b-0">
              <button
                ref={active ? current : undefined}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  getPlayer().playChapter(index);
                  closeSheet();
                }}
                className="relative grid min-h-12 w-full grid-cols-[24px_1fr_auto] items-center gap-3 px-1 py-2 text-left"
              >
                {active ? (
                  <RiVolumeUpFill size={18} aria-label={t('nowPlaying')} className="text-brand" />
                ) : (
                  <span className="text-muted-foreground text-[13px] tabular-nums">
                    {index + 1}
                  </span>
                )}
                <span className={cn('min-w-0', active && 'font-medium')}>{chapter.title}</span>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {formatClock(length)}
                </span>
                {active ? (
                  <span
                    aria-hidden
                    className="bg-muted absolute inset-x-1 bottom-0 h-[3px] rounded-full"
                  >
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </SheetShell>
  );
}

/** The player's three sheets. Which one is open lives in the player UI store. */
export function PlayerSheets() {
  return (
    <>
      <SpeedSheet />
      <SleepSheet />
      <ChaptersSheet />
    </>
  );
}
