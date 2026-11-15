import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { PlayerBarView, type PlayerBarViewProps } from './player-bar-view';

const base: PlayerBarViewProps = {
  state: 'playing',
  book: { slug: 'holmes', title: 'The Adventures of Sherlock Holmes' },
  chapterLabel: 'Ch. 6 · The Man with the Twisted Lip',
  chapterTitle: 'The Man with the Twisted Lip',
  bookProgressPct: 46,
  chapterProgressPct: 52,
  elapsedLabel: '27:14',
  remainingLabel: '−25:26',
};

function renderBar(props: Partial<PlayerBarViewProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PlayerBarView {...base} {...props} />
    </NextIntlClientProvider>,
  );
}

// jsdom applies no CSS, so all three layouts (phone, tablet, desktop) are in the tree at once.
const LAYOUTS = 3;

describe('PlayerBarView', () => {
  it('idle: invites to pick a book and disables play', () => {
    renderBar({ state: 'idle', book: undefined });
    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('playing: offers Pause; paused: offers Play', () => {
    const { unmount } = renderBar({ state: 'playing' });
    expect(screen.getAllByRole('button', { name: 'Pause' })).toHaveLength(LAYOUTS);
    unmount();

    renderBar({ state: 'paused' });
    expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(LAYOUTS);
  });

  it.each(['loading', 'buffering'] as const)(
    '%s: shows a spinner and keeps the controls',
    (state) => {
      renderBar({ state });
      expect(screen.getAllByRole('button', { name: 'Loading…' })).toHaveLength(LAYOUTS);
      expect(screen.getAllByRole('button', { name: 'Forward 30 seconds' })).toHaveLength(LAYOUTS);
    },
  );

  it('error: announces the problem, keeps the position and offers a retry', async () => {
    const onRetry = vi.fn();
    renderBar({ state: 'error', onRetry });

    expect(screen.getAllByRole('alert')).toHaveLength(LAYOUTS);
    expect(
      screen.getByText('Check your connection. Your place is saved at 27:14.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('finished: offers Play again instead of transport controls', async () => {
    const onPlayAgain = vi.fn();
    renderBar({ state: 'finished', bookProgressPct: 100, onPlayAgain });

    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Play again' })[0]!);
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('exposes book progress as a progressbar', () => {
    renderBar();
    const bars = screen.getAllByRole('progressbar', { name: 'Book progress 46%' });
    expect(bars).toHaveLength(LAYOUTS);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '46');
  });

  it('reports play/pause and like clicks', async () => {
    const onPlayPause = vi.fn();
    const onToggleLike = vi.fn();
    renderBar({ liked: true, onPlayPause, onToggleLike });

    await userEvent.click(screen.getAllByRole('button', { name: 'Pause' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Unlike' }));
    expect(onPlayPause).toHaveBeenCalledOnce();
    expect(onToggleLike).toHaveBeenCalledOnce();
  });
});
