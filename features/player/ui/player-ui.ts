'use client';

import { useSyncExternalStore } from 'react';

/**
 * Which player surfaces are open. Two small stores:
 *
 * - the full-screen player lives in the URL as `#player` (PRD), so Back closes it and a
 *   reload keeps it;
 * - the speed / sleep / chapters sheet is plain memory (a sheet closes on Back by itself).
 */

export const PLAYER_HASH = '#player';
const STATE_KEY = '__player';

export type PlayerSheet = 'speed' | 'sleep' | 'chapters';

// ── Full-screen player ─────────────────────────────────────────────────────────

const isHashOpen = () => window.location.hash === PLAYER_HASH;

function subscribeHash(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  hashListeners.add(listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
    hashListeners.delete(listener);
  };
}
// pushState and replaceState fire no event, so our own calls notify by hand.
const hashListeners = new Set<() => void>();
const notifyHash = () => hashListeners.forEach((listener) => listener());

export function openNowPlaying(): void {
  if (isHashOpen()) return;
  // Next.js keeps its router state in history.state, so it is copied.
  window.history.pushState({ ...window.history.state, [STATE_KEY]: true }, '', PLAYER_HASH);
  notifyHash();
}

export function closeNowPlaying(): void {
  if (!isHashOpen()) return;
  if (window.history.state?.[STATE_KEY]) {
    window.history.back(); // remove the entry we added; popstate updates the store
    return;
  }
  // Opened from a link or a reload: there is no entry of ours to go back to.
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
  notifyHash();
}

/** True while the URL says `#player`. False on the server and during hydration. */
export function useNowPlayingOpen(): boolean {
  return useSyncExternalStore(subscribeHash, isHashOpen, () => false);
}

// ── Sheets ─────────────────────────────────────────────────────────────────────

let sheet: PlayerSheet | null = null;
const sheetListeners = new Set<() => void>();

function setSheet(next: PlayerSheet | null): void {
  if (sheet === next) return;
  sheet = next;
  sheetListeners.forEach((listener) => listener());
}

export const openSheet = (which: PlayerSheet) => setSheet(which);
export const closeSheet = () => setSheet(null);

export function useOpenSheet(): PlayerSheet | null {
  return useSyncExternalStore(
    (listener) => {
      sheetListeners.add(listener);
      return () => sheetListeners.delete(listener);
    },
    () => sheet,
    () => null,
  );
}
