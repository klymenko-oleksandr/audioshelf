'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { loadPlayerBook } from './data/load-book';
import { AudioEngine, IDLE_STATE, type PlayerState } from './engine/audio-engine';
import { attachMediaSession } from './engine/media-session';
import { createSingleTab } from './engine/single-tab';
import { createProgressStore } from './storage/local-db';
import type { ProgressRecord } from './storage/progress-store';

let engine: AudioEngine | null = null;

/**
 * The one player for this tab. Created on first use in the browser and never torn down:
 * it owns the single audio element, so playback survives every navigation.
 */
export function getPlayer(): AudioEngine {
  if (typeof window === 'undefined') {
    throw new Error('The player only exists in the browser.');
  }
  if (engine) return engine;

  const tabs = createSingleTab(() => engine?.pause());
  const created = new AudioEngine({
    createAudio: () => new Audio(),
    store: createProgressStore(),
    resolveBook: (bookId) => loadPlayerBook(bookId),
    onPlaybackStart: tabs.announce,
  });
  engine = created;

  attachMediaSession(created);

  // "Saved … on tab hide and page unload" (PRD). pagehide also covers iOS, where
  // beforeunload is unreliable.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') created.flush();
  });
  window.addEventListener('pagehide', () => created.flush());

  void created.init();
  return created;
}

const subscribe = (listener: () => void) => getPlayer().subscribe(listener);

/** Live player state. Idle on the server and during hydration. */
export function usePlayerState(): PlayerState {
  return useSyncExternalStore(
    subscribe,
    () => getPlayer().getState(),
    () => IDLE_STATE,
  );
}

/** A slice of the player state; re-renders only when the slice changes. */
export function usePlayerSelector<T>(select: (state: PlayerState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(getPlayer().getState()),
    () => select(IDLE_STATE),
  );
}

/** Saved progress for a book, kept up to date as the player saves. */
export function useBookProgress(bookId: string): ProgressRecord | undefined {
  const version = useSyncExternalStore(
    subscribe,
    () => getPlayer().getProgressVersion(),
    () => -1,
  );
  return version < 0 ? undefined : getPlayer().getProgress(bookId);
}

/**
 * Saved progress for every book on this device, or `undefined` until it has been read
 * (on the server, during hydration and for the first moments after).
 */
export function useAllProgress(): ProgressRecord[] | undefined {
  const version = useSyncExternalStore(
    subscribe,
    () => getPlayer().getProgressVersion(),
    () => -1,
  );
  // Version 0 is the engine before it has loaded the store.
  return useMemo(() => (version < 1 ? undefined : getPlayer().getAllProgress()), [version]);
}
