'use client';

import { useTranslations } from 'next-intl';
import { useSettings } from '@/features/settings/use-settings';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';
import { formatClock, formatRemaining, formatSpeed, isWaiting, splitDuration } from '../core';
import { getPlayer, usePlayerState } from '../player';
import { openNowPlaying, openSheet } from '../ui/player-ui';
import { PlayerBarView } from './player-bar-view';
import { viewState } from './view-state';

/** PlayerBarView connected to the real player. */
export function PlayerBarLive() {
  const t = useTranslations('player');
  const settings = useSettings();
  const state = usePlayerState();
  const spinnerVisible = useDelayedLoading(isWaiting(state.status));
  const { book, position, duration, chapterIndex, speed, status, sleep } = state;

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
      skipBackSeconds={settings.skipBackSeconds}
      skipForwardSeconds={settings.skipForwardSeconds}
      onSkipBack={() => player.skipBack()}
      onSkipForward={() => player.skipForward()}
      onPreviousChapter={() => player.previousChapter()}
      onNextChapter={() => player.nextChapter()}
      onSeek={(fraction) => player.seek(fraction * duration)}
      onRetry={() => player.retry()}
      onPlayAgain={() => player.play()}
      sleepLabel={sleep ? formatClock(Math.ceil(sleep.remainingMs / 1000)) : undefined}
      onOpen={openNowPlaying}
      onSpeed={() => openSheet('speed')}
      onSleepTimer={() => openSheet('sleep')}
      onChapters={() => openSheet('chapters')}
    />
  );
}
