'use client';

import { useTranslations } from 'next-intl';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import {
  formatClock,
  formatRemaining,
  formatSpeed,
  isWaiting,
  SPEED_PRESETS,
  splitDuration,
  type PlayerStatus,
} from '../core';
import { getPlayer, usePlayerState } from '../player';
import { PlayerBarView, type PlayerViewState } from './player-bar-view';

/** Next preset after the current speed, wrapping around. Interim until the speed sheet (2c). */
function nextPreset(speed: number): number {
  return SPEED_PRESETS.find((preset) => preset > speed + 0.001) ?? SPEED_PRESETS[0];
}

/**
 * The spinner follows the loader timing rule: nothing for the first 300 ms of waiting, then
 * at least 600 ms. Until it shows, the bar keeps looking like it is playing.
 */
function viewState(status: PlayerStatus, spinnerVisible: boolean): PlayerViewState {
  if (isWaiting(status)) return spinnerVisible ? status : 'playing';
  if (status === 'playing' && spinnerVisible) return 'buffering';
  return status;
}

/** PlayerBarView connected to the real player. */
export function PlayerBarLive() {
  const t = useTranslations('player');
  const state = usePlayerState();
  const spinnerVisible = useDelayedLoading(isWaiting(state.status));
  const { book, position, duration, chapterIndex, speed, status } = state;

  if (!book) return <PlayerBarView state="idle" />;

  const player = getPlayer();
  const chapter = book.chapters[chapterIndex];
  const chapterElapsed = chapter ? position - chapter.start : 0;
  const chapterLength = chapter ? chapter.end - chapter.start : 0;
  // Wall-clock time left in the chapter at the current speed, never shown as "0 min".
  const left = splitDuration(Math.max(0, chapterLength - chapterElapsed) / speed);
  const chapterLeft = left.hours === 0 && left.minutes === 0 ? { hours: 0, minutes: 1 } : left;
  const number = chapterIndex + 1;

  return (
    <PlayerBarView
      state={viewState(status, spinnerVisible)}
      book={book}
      chapterLabel={chapter ? t('chapterLabel', { number, title: chapter.title }) : undefined}
      chapterTitle={chapter?.title}
      bookProgressPct={duration > 0 ? (position / duration) * 100 : 0}
      positionText={t('positionText', {
        position: formatClock(position),
        duration: formatClock(duration),
      })}
      elapsedLabel={formatClock(position)}
      remainingLabel={formatRemaining(duration - position)}
      positionLabel={`${t('chapterShort', { number })} · ${formatClock(chapterElapsed)} / ${formatClock(chapterLength)}`}
      timeLeftLabel={
        chapterLeft.hours > 0 ? t('hoursLeft', chapterLeft) : t('minutesLeft', chapterLeft)
      }
      speedLabel={formatSpeed(speed)}
      upToDate={book.ongoing}
      onPlayPause={() => player.toggle()}
      onSkipBack={() => player.skipBack()}
      onSkipForward={() => player.skipForward()}
      onPreviousChapter={() => player.previousChapter()}
      onNextChapter={() => player.nextChapter()}
      onSeek={(fraction) => player.seek(fraction * duration)}
      onRetry={() => player.retry()}
      onPlayAgain={() => player.play()}
      onSpeed={() => player.setSpeed(nextPreset(speed))}
    />
  );
}
