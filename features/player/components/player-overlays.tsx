'use client';

import { useEffect } from 'react';
import { getPlayer, usePlayerSelector } from '../player';
import { useNowPlayingOpen } from '../ui/player-ui';
import { shortcutFor } from '../ui/shortcuts';
import { NowPlaying } from './now-playing';
import { PlayerSheets } from './player-sheets';

/** Keyboard shortcuts, live for as long as a book is loaded. */
function usePlayerShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const el = event.target instanceof HTMLElement ? event.target : null;
      const shortcut = shortcutFor({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        target: el && {
          tagName: el.tagName,
          type: el.getAttribute('type') ?? undefined,
          role: el.getAttribute('role'),
          isContentEditable: el.isContentEditable,
        },
      });
      if (!shortcut) return;

      event.preventDefault(); // Space would scroll the page
      const player = getPlayer();
      if (shortcut === 'toggle') player.toggle();
      else if (shortcut === 'skipBack') player.skipBack();
      else if (shortcut === 'skipForward') player.skipForward();
      else if (shortcut === 'previousChapter') player.previousChapter();
      else player.nextChapter();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Everything the player shows on top of the app: the full-screen player and the speed,
 * sleep and chapters sheets. Also owns the keyboard shortcuts.
 */
export function PlayerOverlays() {
  const hasBook = usePlayerSelector((state) => state.book !== null);
  const nowPlayingOpen = useNowPlayingOpen() && hasBook;
  usePlayerShortcuts(hasBook);

  return (
    <>
      <NowPlaying />
      {/* While the full-screen player is open it renders the sheets itself, nested. */}
      {nowPlayingOpen ? null : <PlayerSheets />}
    </>
  );
}
