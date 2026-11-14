'use client';

import {
  RiArrowUpSLine,
  RiErrorWarningLine,
  RiForward30Line,
  RiHeartFill,
  RiHeartLine,
  RiPauseFill,
  RiPlayFill,
  RiPlayList2Line,
  RiRefreshLine,
  RiReplay15Line,
  RiRestartLine,
  RiSkipBackFill,
  RiSkipForwardFill,
  RiTimerLine,
  RiVolumeUpLine,
} from '@remixicon/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { cn } from '@/lib/utils';

/** Mirrors the player state machine in the PRD (Phase 2 owns the real one). */
export type PlayerViewState =
  'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'finished';

export interface PlayerBarViewProps {
  state: PlayerViewState;
  book?: { slug: string; title: string; coverUrl?: string };
  /** "Ch. 6 · The Man with the Twisted Lip" */
  chapterLabel?: string;
  /** "The Man with the Twisted Lip" — the phone bar leads with the chapter. */
  chapterTitle?: string;
  bookProgressPct?: number;
  chapterProgressPct?: number;
  /** All time strings arrive formatted: "27:14", "−25:26", "27:14 / 52:40", "25 min left". */
  elapsedLabel?: string;
  remainingLabel?: string;
  positionLabel?: string;
  timeLeftLabel?: string;
  speedLabel?: string;
  liked?: boolean;
  onPlayPause?: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  onPreviousChapter?: () => void;
  onNextChapter?: () => void;
  onRetry?: () => void;
  onPlayAgain?: () => void;
  onOpen?: () => void;
  onSpeed?: () => void;
  onSleepTimer?: () => void;
  onChapters?: () => void;
  onToggleLike?: () => void;
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'hover:bg-accent grid size-8 shrink-0 place-items-center rounded-md pointer-coarse:size-11 pointer-coarse:rounded-full',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The persistent player bar in every state and at every shell width
 * (canvas: PlayerBar, PlayerStates, TabletHome, MobileDock).
 *
 * The three layouts switch on the width of the bar itself (container queries), which in the
 * app equals the shell breakpoints: under 768 px the floating card, 768–1023 px the compact
 * bar, 1024 px and up the full bar. The desktop grid keeps the transport centred when there is room (equal side columns) and
 * lets the right-hand controls keep their width when there is not.
 *
 * Presentational: it renders what it is given and reports clicks. The progress track is a
 * picture here; Phase 2 turns it into a real slider together with the audio engine.
 */
export function PlayerBarView(props: PlayerBarViewProps) {
  const t = useTranslations('player');
  const {
    state,
    book,
    bookProgressPct = 0,
    chapterProgressPct = 0,
    speedLabel = '1×',
    liked = false,
  } = props;

  if (state === 'idle' || !book) {
    return (
      <div className="@container">
        <div className="border-border bg-card flex h-15 items-center gap-2.5 rounded-lg border pr-1 pl-2 shadow-lg @3xl:h-18 @3xl:gap-3 @3xl:rounded-none @3xl:border-x-0 @3xl:border-b-0 @3xl:px-4 @3xl:shadow-none @5xl:h-20 @5xl:px-5">
          <span
            aria-hidden
            className="bg-muted size-10 shrink-0 rounded-sm @3xl:size-12 @3xl:rounded-md"
          />
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate text-[13px] font-medium">{t('idleTitle')}</span>
            <span className="text-muted-foreground truncate text-[11px]">{t('idleHint')}</span>
          </span>
          <button
            type="button"
            disabled
            aria-label={t('play')}
            className="@3xl:bg-primary @3xl:text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50 @3xl:size-12 @5xl:size-10"
          >
            <RiPlayFill aria-hidden className="size-6 @5xl:size-5" />
          </button>
        </div>
      </div>
    );
  }

  const busy = state === 'loading' || state === 'buffering';
  const failed = state === 'error';
  const finished = state === 'finished';
  const position = props.elapsedLabel ?? '0:00';

  const mainLabel = busy ? t('loading') : state === 'playing' ? t('pause') : t('play');
  const mainIcon = (size: number) =>
    busy ? (
      <Spinner className="size-[18px]" />
    ) : state === 'playing' ? (
      <RiPauseFill size={size} aria-hidden />
    ) : (
      <RiPlayFill size={size} aria-hidden />
    );

  const cover = (className: string) => (
    <span className={cn('shrink-0', className)}>
      <BookCover title={book.title} src={book.coverUrl} seed={book.slug} />
    </span>
  );

  const progressLine = (edge: 'top' | 'bottom') => (
    <span
      role="progressbar"
      aria-label={t('bookProgress', { pct: Math.round(bookProgressPct) })}
      aria-valuenow={Math.round(bookProgressPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'absolute inset-x-0 h-0.5',
        edge === 'top' ? 'bg-border -top-px' : 'bg-muted bottom-0',
      )}
    >
      <span className="bg-primary block h-full" style={{ width: `${bookProgressPct}%` }} />
    </span>
  );

  const errorIcon = (
    <RiErrorWarningLine size={20} aria-hidden className="text-destructive shrink-0" />
  );

  return (
    <div className="@container">
      {/* ── Phone: floating card above the tab bar ─────────────────────────────── */}
      <div className="border-border bg-card relative flex h-15 items-center gap-2.5 overflow-hidden rounded-lg border pr-1 pl-2 shadow-lg @3xl:hidden">
        {failed ? (
          <>
            <span role="alert" className="flex min-w-0 grow items-center gap-2.5">
              <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-sm">
                {errorIcon}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">{t('errorTitle')}</span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {t('errorHintShort', { position })}
                </span>
              </span>
            </span>
            <IconButton label={t('retry')} onClick={props.onRetry} className="size-11 rounded-full">
              <RiRefreshLine size={20} aria-hidden />
            </IconButton>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={props.onOpen}
              aria-label={t('open')}
              className="flex min-w-0 grow items-center gap-2.5 rounded-sm text-left"
            >
              {cover('size-10 rounded-sm')}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium">
                  {finished ? t('finished') : (props.chapterTitle ?? book.title)}
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {[book.title, finished ? undefined : props.timeLeftLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
            {finished ? (
              <IconButton
                label={t('playAgain')}
                onClick={props.onPlayAgain}
                className="size-11 rounded-full"
              >
                <RiRestartLine size={22} aria-hidden />
              </IconButton>
            ) : (
              <>
                <IconButton
                  label={mainLabel}
                  onClick={props.onPlayPause}
                  className="size-11 rounded-full"
                >
                  {mainIcon(24)}
                </IconButton>
                <IconButton
                  label={t('forward', { seconds: 30 })}
                  onClick={props.onSkipForward}
                  className="size-11 rounded-full"
                >
                  <RiForward30Line size={20} aria-hidden />
                </IconButton>
              </>
            )}
          </>
        )}
        {progressLine('bottom')}
      </div>

      {/* ── Tablet: compact bar ────────────────────────────────────────────────── */}
      <div className="border-border bg-card relative hidden h-18 items-center gap-3 border-t pr-3 pl-4 @3xl:flex @5xl:hidden">
        {progressLine('top')}
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={t('open')}
          className="flex min-w-0 grow items-center gap-2.5 rounded-md text-left"
        >
          {cover('size-12 rounded-md')}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium">
              {failed
                ? t('errorTitle')
                : finished
                  ? t('finished')
                  : (props.chapterTitle ?? book.title)}
            </span>
            <span
              role={failed ? 'alert' : undefined}
              className="text-muted-foreground truncate text-[11px]"
            >
              {failed
                ? t('errorHintShort', { position })
                : finished
                  ? book.title
                  : busy
                    ? t('loading')
                    : props.positionLabel}
            </span>
          </span>
        </button>
        {failed ? (
          <Button variant="outline" size="sm" onClick={props.onRetry}>
            <RiRefreshLine aria-hidden />
            {t('retry')}
          </Button>
        ) : finished ? (
          <Button variant="outline" size="sm" onClick={props.onPlayAgain}>
            <RiRestartLine aria-hidden />
            {t('playAgain')}
          </Button>
        ) : (
          <>
            <IconButton
              label={t('back', { seconds: 15 })}
              onClick={props.onSkipBack}
              className="size-11 rounded-full"
            >
              <RiReplay15Line size={20} aria-hidden />
            </IconButton>
            <button
              type="button"
              aria-label={mainLabel}
              onClick={props.onPlayPause}
              className="bg-primary text-primary-foreground grid size-12 shrink-0 place-items-center rounded-full"
            >
              {mainIcon(24)}
            </button>
            <IconButton
              label={t('forward', { seconds: 30 })}
              onClick={props.onSkipForward}
              className="size-11 rounded-full"
            >
              <RiForward30Line size={20} aria-hidden />
            </IconButton>
            <Button variant="ghost" size="sm" aria-label={t('speed')} onClick={props.onSpeed}>
              {speedLabel}
            </Button>
          </>
        )}
        <IconButton label={t('open')} onClick={props.onOpen} className="size-11 rounded-full">
          <RiArrowUpSLine size={20} aria-hidden />
        </IconButton>
      </div>

      {/* ── Desktop: full bar ──────────────────────────────────────────────────── */}
      <div className="border-border bg-card text-card-foreground relative hidden h-20 grid-cols-[minmax(180px,1fr)_minmax(280px,560px)_minmax(max-content,1fr)] items-center gap-6 border-t px-5 @5xl:grid">
        {progressLine('top')}

        <button
          type="button"
          onClick={props.onOpen}
          className="flex min-w-0 items-center gap-3 rounded-md text-left"
        >
          {cover('size-13 rounded-md')}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13px] font-medium">{book.title}</span>
            <span className="text-muted-foreground truncate text-[12px]">{props.chapterLabel}</span>
          </span>
        </button>

        {failed ? (
          <div role="alert" className="flex min-w-0 items-center justify-center gap-3">
            {errorIcon}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{t('errorTitle')}</span>
              <span className="text-muted-foreground truncate text-[12px]">
                {t('errorHint', { position })}
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={props.onRetry}>
              <RiRefreshLine aria-hidden />
              {t('retry')}
            </Button>
          </div>
        ) : finished ? (
          <div className="flex items-center justify-center gap-3">
            <span className="font-medium">{t('finished')}</span>
            <Button variant="outline" size="sm" onClick={props.onPlayAgain}>
              <RiRestartLine aria-hidden />
              {t('playAgain')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3">
              <IconButton label={t('back', { seconds: 15 })} onClick={props.onSkipBack}>
                <RiReplay15Line size={20} aria-hidden />
              </IconButton>
              <IconButton label={t('previousChapter')} onClick={props.onPreviousChapter}>
                <RiSkipBackFill size={20} aria-hidden />
              </IconButton>
              <button
                type="button"
                aria-label={mainLabel}
                onClick={props.onPlayPause}
                className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full"
              >
                {mainIcon(20)}
              </button>
              <IconButton label={t('nextChapter')} onClick={props.onNextChapter}>
                <RiSkipForwardFill size={20} aria-hidden />
              </IconButton>
              <IconButton label={t('forward', { seconds: 30 })} onClick={props.onSkipForward}>
                <RiForward30Line size={20} aria-hidden />
              </IconButton>
            </div>
            <div className="text-muted-foreground flex w-full max-w-140 items-center gap-2.5 text-[11px] tabular-nums">
              <span>{busy ? t('loading') : props.elapsedLabel}</span>
              <span aria-hidden className="bg-muted relative h-1 grow rounded-full">
                <span
                  className="bg-foreground block h-full rounded-full"
                  style={{ width: `${chapterProgressPct}%` }}
                />
                <span
                  className="bg-foreground absolute -top-1 -ml-1.5 size-3 rounded-full"
                  style={{ left: `${chapterProgressPct}%` }}
                />
              </span>
              <span>{props.remainingLabel}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" aria-label={t('speed')} onClick={props.onSpeed}>
            {speedLabel}
          </Button>
          <IconButton label={t('sleepTimer')} onClick={props.onSleepTimer}>
            <RiTimerLine size={18} aria-hidden />
          </IconButton>
          <IconButton label={t('chapters')} onClick={props.onChapters}>
            <RiPlayList2Line size={18} aria-hidden />
          </IconButton>
          <IconButton
            label={t(liked ? 'unlike' : 'like')}
            onClick={props.onToggleLike}
            className={liked ? 'text-brand' : undefined}
          >
            {liked ? <RiHeartFill size={18} aria-hidden /> : <RiHeartLine size={18} aria-hidden />}
          </IconButton>
          <span aria-hidden className="text-muted-foreground mx-2 flex items-center gap-2">
            <RiVolumeUpLine size={18} />
            <span className="bg-muted h-1 w-18 rounded-full">
              <span className="bg-muted-foreground block h-full w-[70%] rounded-full" />
            </span>
          </span>
          <IconButton label={t('open')} onClick={props.onOpen}>
            <RiArrowUpSLine size={20} aria-hidden />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
