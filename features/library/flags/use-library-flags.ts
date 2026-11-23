'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createBrowserChannel } from '@/features/settings/channel';
import { getLocalDb } from '@/lib/local-db/shared';
import { toggleWithToast, type FlagToastLabels } from './actions';
import {
  createDexieFlagsRepo,
  LibraryFlagsStore,
  type FlagKind,
  type FlagsSnapshot,
} from './store';

/** Pings between tabs (own names, so they never wake the Settings listeners). */
const CHANNEL_NAME = 'audioshelf-library';
const STORAGE_PING_KEY = 'audioshelf:library-ping';

let store: LibraryFlagsStore | null = null;

/**
 * This tab's likes and Listen later. Created on first use in the browser; it reads Dexie at
 * once and listens for changes made in other tabs.
 */
export function getLibraryFlagsStore(): LibraryFlagsStore {
  if (typeof window === 'undefined') throw new Error('Likes only exist in the browser.');
  if (store) return store;

  store = new LibraryFlagsStore({
    repo: createDexieFlagsRepo(getLocalDb()),
    channel: createBrowserChannel(CHANNEL_NAME, STORAGE_PING_KEY),
  });
  void store.load();
  return store;
}

/** For tests: drop this tab's store (and its channel) so the next use starts fresh. */
export function resetLibraryFlagsStoreForTests(): void {
  store?.dispose();
  store = null;
}

const subscribe = (listener: () => void) => getLibraryFlagsStore().subscribe(listener);

/** Nothing liked, not ready: the server and hydration render this, so markup always matches. */
const SERVER_SNAPSHOT: FlagsSnapshot = {
  ready: false,
  liked: new Set(),
  listenLater: new Set(),
  likedAt: new Map(),
  listenLaterAt: new Map(),
};

function useFlagToastLabels(): FlagToastLabels {
  const t = useTranslations('flags');
  return useMemo(
    () => ({
      likeAdded: t('likeAdded'),
      likeRemoved: t('likeRemoved'),
      laterAdded: t('laterAdded'),
      laterRemoved: t('laterRemoved'),
      undo: t('undo'),
    }),
    [t],
  );
}

function newestFirst(added: ReadonlyMap<string, number>): string[] {
  return [...added].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}

export interface LibraryFlags {
  /** False until storage has been read. */
  ready: boolean;
  /** Liked books, most recently added first (for the Library page). */
  likedIds: readonly string[];
  /** Listen later, most recently added first. */
  listenLaterIds: readonly string[];
  /** When each liked / queued book was added. */
  likedAt: ReadonlyMap<string, number>;
  listenLaterAt: ReadonlyMap<string, number>;
  isLiked(bookId: string): boolean;
  isListenLater(bookId: string): boolean;
  /** Flips the like, shows the change at once and a toast with Undo. */
  toggleLike(bookId: string): void;
  toggleListenLater(bookId: string): void;
}

/**
 * Likes and Listen later for any number of books (lists, rows). A change shows at once,
 * is saved to Dexie and reaches the other tabs. A page with many cards should use
 * `useBookFlags` instead, so each card re-renders only for its own book.
 */
export function useLibraryFlags(): LibraryFlags {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getLibraryFlagsStore().getSnapshot(),
    () => SERVER_SNAPSHOT,
  );
  const labels = useFlagToastLabels();

  return useMemo(() => {
    const toggle = (kind: FlagKind, bookId: string) =>
      void toggleWithToast(getLibraryFlagsStore(), kind, bookId, labels);
    return {
      ready: snapshot.ready,
      likedIds: newestFirst(snapshot.likedAt),
      listenLaterIds: newestFirst(snapshot.listenLaterAt),
      likedAt: snapshot.likedAt,
      listenLaterAt: snapshot.listenLaterAt,
      isLiked: (bookId) => snapshot.liked.has(bookId),
      isListenLater: (bookId) => snapshot.listenLater.has(bookId),
      toggleLike: (bookId) => toggle('like', bookId),
      toggleListenLater: (bookId) => toggle('listenLater', bookId),
    };
  }, [snapshot, labels]);
}

export interface BookFlags {
  ready: boolean;
  liked: boolean;
  listenLater: boolean;
  toggleLike(): void;
  toggleListenLater(): void;
}

/** Bit 1 = liked, bit 2 = in Listen later, bit 4 = ready: one number, so React can compare. */
function bookBits(snapshot: FlagsSnapshot, bookId: string): number {
  return (
    (snapshot.liked.has(bookId) ? 1 : 0) |
    (snapshot.listenLater.has(bookId) ? 2 : 0) |
    (snapshot.ready ? 4 : 0)
  );
}

/** The flags of one book. The component re-renders only when this book's flags change. */
export function useBookFlags(bookId: string): BookFlags {
  const bits = useSyncExternalStore(
    subscribe,
    () => bookBits(getLibraryFlagsStore().getSnapshot(), bookId),
    () => 0,
  );
  const labels = useFlagToastLabels();
  const toggleLike = useCallback(
    () => void toggleWithToast(getLibraryFlagsStore(), 'like', bookId, labels),
    [bookId, labels],
  );
  const toggleListenLater = useCallback(
    () => void toggleWithToast(getLibraryFlagsStore(), 'listenLater', bookId, labels),
    [bookId, labels],
  );

  return useMemo(
    () => ({
      ready: (bits & 4) !== 0,
      liked: (bits & 1) !== 0,
      listenLater: (bits & 2) !== 0,
      toggleLike,
      toggleListenLater,
    }),
    [bits, toggleLike, toggleListenLater],
  );
}
