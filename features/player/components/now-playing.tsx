'use client';

import {
  RiArrowDownSLine,
  RiEqualizerLine,
  RiErrorWarningLine,
  RiPauseFill,
  RiPlayFill,
  RiPlayList2Line,
  RiRefreshLine,
  RiRestartLine,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiSpeedUpLine,
  RiTimerLine,
} from '@remixicon/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { cn } from '@/lib/utils';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import {
  formatClock,
  formatRemaining,
  formatSpeed,
  isWaiting,
  SLEEP_MINUTE_OPTIONS,
  SPEED_PRESETS,
} from '../core';
import { useSettings } from '@/features/settings/use-settings';
import { getPlayer, usePlayerState } from '../player';
import { closeNowPlaying, openSheet, useNowPlayingOpen } from '../ui/player-ui';
import { PlayerSheets } from './player-sheets';
import { Scrubber } from './scrubber';
import { SkipIcon } from './skip-icon';
import { useDurationLabel } from './use-duration-label';
import { viewState } from './view-state';

function Transport({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hover:bg-accent grid size-12 shrink-0 place-items-center rounded-full"
    >
      {children}
    </button>
  );
}

function Action({
  icon,
  label,
  value,
  name,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  /** Shown instead of the label when set (the speed, the time left on the sleep timer). */
  value?: string;
  /** Accessible name when the visible text alone is not enough. */
  name?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onClick}
      className="hover:bg-accent flex min-h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px]"
    >
      <span aria-hidden className="flex">
        {icon}
      </span>
      <span className={value ? 'text-brand font-medium tabular-nums' : 'text-muted-foreground'}>
        {value ?? label}
      </span>
    </button>
  );
}

/**
 * The full-screen player (canvas: MNowPlaying, NowPlaying). Open while the URL says
 * `#player` and a book is loaded, so Back closes it. One layout for every width: a centred
 * column that grows a little on larger screens.
 *
 * Its scrubber is chapter-scoped (the bar's is book-scoped); the book position sits below.
 * From 1024 px the speed presets and the sleep menu are inline instead of sheets.
 * Bookmarks, text and like join the actions row with their features.
 */
export function NowPlaying() {
  const t = useTranslations('player');
  const { skipBackSeconds: skipBack, skipForwardSeconds: skipForward } = useSettings();
  const state = usePlayerState();
  const hashOpen = useNowPlayingOpen();
  const spinnerVisible = useDelayedLoading(isWaiting(state.status));
  const duration = useDurationLabel();
  const { book, position, chapterIndex, speed, status, sleep } = state;
  const open = hashOpen && book !== null;

  const view = viewState(status, spinnerVisible);
  const busy = view === 'loading' || view === 'buffering';
  const chapter = book?.chapters[chapterIndex];
  const start = chapter?.start ?? 0;
  const length = chapter ? chapter.end - chapter.start : 0;
  const elapsed = Math.min(length, Math.max(0, position - start));
  const sleepTime = sleep ? formatClock(Math.ceil(sleep.remainingMs / 1000)) : undefined;
  const sleepValue =
    sleep === null
      ? 'off'
      : sleep.timer.kind === 'minutes'
        ? String(sleep.timer.minutes)
        : 'chapter';
  const finishedLabel = book?.ongoing ? t('upToDate') : t('finished');

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) closeNowPlaying();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-testid="now-playing"
        className="bg-background gap-0 overflow-y-auto border-t-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] text-[15px] data-[side=bottom]:h-dvh"
      >
        {book ? (
          <>
            <header className="grid h-14 shrink-0 grid-cols-[44px_1fr_44px] items-center px-2 md:px-4">
              <button
                type="button"
                aria-label={t('close')}
                onClick={closeNowPlaying}
                className="hover:bg-accent grid size-11 place-items-center rounded-full"
              >
                <RiArrowDownSLine size={26} aria-hidden />
              </button>
              <SheetTitle className="truncate text-center text-[13px] font-medium">
                {book.title}
              </SheetTitle>
            </header>

            <div className="mx-auto flex w-full max-w-[640px] grow flex-col items-center justify-center gap-5 px-6 pb-6 md:gap-6">
              <div className="w-[min(100%,380px,36dvh)] shrink-0 overflow-hidden rounded-xl shadow-lg">
                <BookCover
                  title={book.title}
                  author={book.author}
                  src={book.coverUrl}
                  seed={book.slug}
                />
              </div>

              <div className="flex w-full flex-col items-center gap-1 text-center">
                <h2 data-testid="chapter-title" className="text-h3 md:text-h2 line-clamp-2">
                  {status === 'finished' ? finishedLabel : (chapter?.title ?? book.title)}
                </h2>
                <SheetDescription className="text-[13px]">
                  {[
                    chapter
                      ? t('chapterOf', { number: chapterIndex + 1, count: book.chapters.length })
                      : undefined,
                    book.author,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </SheetDescription>
              </div>

              <div className="flex w-full flex-col">
                <Scrubber
                  value={length > 0 ? elapsed / length : 0}
                  label={t('chapterScrubber')}
                  valueText={t('positionText', {
                    position: formatClock(elapsed),
                    duration: formatClock(length),
                  })}
                  onSeek={(fraction) => getPlayer().seek(start + fraction * length)}
                  className="scrubber-lg w-full"
                />
                <div className="text-muted-foreground flex items-baseline justify-between gap-3 text-[12px] tabular-nums">
                  <span>{formatClock(elapsed)}</span>
                  <span className="truncate" data-testid="book-position">
                    {t('bookPosition', {
                      position: duration(position),
                      duration: duration(state.duration),
                    })}
                  </span>
                  <span>{formatRemaining(length - elapsed)}</span>
                </div>
              </div>

              {status === 'error' ? (
                <div role="alert" className="flex items-center gap-3 text-left">
                  <RiErrorWarningLine size={20} aria-hidden className="text-destructive shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{t('errorTitle')}</span>
                    <span className="text-muted-foreground text-[12px]">
                      {t('errorHint', { position: formatClock(position) })}
                    </span>
                  </span>
                </div>
              ) : null}

              <div className="flex w-full max-w-[380px] items-center justify-between">
                <Transport
                  label={t('back', { seconds: skipBack })}
                  onClick={() => getPlayer().skipBack()}
                >
                  <SkipIcon direction="back" seconds={skipBack} size={28} />
                </Transport>
                <Transport
                  label={t('previousChapter')}
                  onClick={() => getPlayer().previousChapter()}
                >
                  <RiSkipBackFill size={28} aria-hidden />
                </Transport>
                <button
                  type="button"
                  aria-label={
                    status === 'error'
                      ? t('retry')
                      : status === 'finished'
                        ? t('playAgain')
                        : busy
                          ? t('loading')
                          : view === 'playing'
                            ? t('pause')
                            : t('play')
                  }
                  onClick={() => getPlayer().toggle()}
                  className="bg-primary text-primary-foreground grid size-18 shrink-0 place-items-center rounded-full shadow-lg"
                >
                  {status === 'error' ? (
                    <RiRefreshLine size={30} aria-hidden />
                  ) : status === 'finished' ? (
                    <RiRestartLine size={30} aria-hidden />
                  ) : busy ? (
                    <Spinner className="size-7" />
                  ) : view === 'playing' ? (
                    <RiPauseFill size={36} aria-hidden />
                  ) : (
                    <RiPlayFill size={36} aria-hidden />
                  )}
                </button>
                <Transport label={t('nextChapter')} onClick={() => getPlayer().nextChapter()}>
                  <RiSkipForwardFill size={28} aria-hidden />
                </Transport>
                <Transport
                  label={t('forward', { seconds: skipForward })}
                  onClick={() => getPlayer().skipForward()}
                >
                  <SkipIcon direction="forward" seconds={skipForward} size={28} />
                </Transport>
              </div>

              <div className="flex w-full max-w-[380px] items-start justify-around lg:hidden">
                <Action
                  icon={<RiSpeedUpLine size={22} />}
                  label={t('speedShort')}
                  value={formatSpeed(speed)}
                  name={t('speed')}
                  onClick={() => openSheet('speed')}
                />
                <Action
                  icon={<RiTimerLine size={22} />}
                  label={t('sleepShort')}
                  value={sleep ? formatClock(Math.ceil(sleep.remainingMs / 1000)) : undefined}
                  name={t('sleepTimer')}
                  onClick={() => openSheet('sleep')}
                />
                <Action
                  icon={<RiPlayList2Line size={22} />}
                  label={t('chapters')}
                  onClick={() => openSheet('chapters')}
                />
              </div>

              {/* Desktop (canvas: NowPlaying): speed presets and the sleep menu are inline. */}
              <div className="hidden w-full items-center justify-center gap-3 lg:flex">
                <div
                  role="group"
                  aria-label={t('speed')}
                  className="border-border flex items-center rounded-md border p-0.5"
                >
                  {SPEED_PRESETS.map((preset) => {
                    const active = Math.abs(preset - speed) < 0.001;
                    return (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={active}
                        onClick={() => getPlayer().setSpeed(preset)}
                        className={cn(
                          'h-8 rounded-sm px-2.5 text-[13px] font-medium tabular-nums',
                          active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                        )}
                      >
                        {formatSpeed(preset)}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-label={`${t('speed')}: ${formatSpeed(speed)}`}
                    onClick={() => openSheet('speed')}
                    className="hover:bg-accent grid size-8 place-items-center rounded-sm"
                  >
                    <RiEqualizerLine size={16} aria-hidden />
                  </button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="secondary" size="sm" />}
                    aria-label={sleepTime ? t('sleepOn', { time: sleepTime }) : t('sleepTimer')}
                    className={sleepTime ? 'text-brand tabular-nums' : undefined}
                  >
                    <RiTimerLine aria-hidden />
                    {sleepTime ? t('sleepValue', { time: sleepTime }) : t('sleepShort')}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" side="top" className="w-auto min-w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{t('sleepGroup')}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={sleepValue}
                        onValueChange={(value: string) =>
                          getPlayer().setSleepTimer(
                            value === 'off'
                              ? null
                              : value === 'chapter'
                                ? 'chapter'
                                : Number(value),
                          )
                        }
                      >
                        {SLEEP_MINUTE_OPTIONS.map((minutes) => (
                          <DropdownMenuRadioItem key={minutes} value={String(minutes)} closeOnClick>
                            {t('sleepMinutes', { minutes })}
                          </DropdownMenuRadioItem>
                        ))}
                        {chapter ? (
                          <DropdownMenuRadioItem value="chapter" closeOnClick>
                            {t('sleepEndOfChapter')}
                          </DropdownMenuRadioItem>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioItem value="off" closeOnClick>
                          {t('sleepOff')}
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="secondary" size="sm" onClick={() => openSheet('chapters')}>
                  <RiPlayList2Line aria-hidden />
                  {t('chapters')}
                </Button>
              </div>
            </div>

            {/* Nested here, so Esc and focus belong to the sheet on top. */}
            <PlayerSheets />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
