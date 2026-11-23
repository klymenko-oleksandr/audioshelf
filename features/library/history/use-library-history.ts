'use client';

import { useSyncExternalStore } from 'react';
import { createBrowserChannel } from '@/features/settings/channel';
import { getLocalDb } from '@/lib/local-db/shared';
import { createDexieHistoryRepo, LibraryHistoryStore, type HistorySnapshot } from './store';

/** Same channel as likes and Listen later: one ping means "re-read the library". */
const CHANNEL_NAME = 'audioshelf-library';
const STORAGE_PING_KEY = 'audioshelf:library-ping';

let store: LibraryHistoryStore | null = null;

/** This tab's History. Created on first use in the browser; reads Dexie at once. */
export function getLibraryHistoryStore(): LibraryHistoryStore {
  if (typeof window === 'undefined') throw new Error('History only exists in the browser.');
  if (store) return store;

  store = new LibraryHistoryStore({
    repo: createDexieHistoryRepo(getLocalDb()),
    channel: createBrowserChannel(CHANNEL_NAME, STORAGE_PING_KEY),
  });
  void store.load();
  return store;
}

/** For tests: drop this tab's store so the next use starts fresh. */
export function resetLibraryHistoryStoreForTests(): void {
  store?.dispose();
  store = null;
}

const subscribe = (listener: () => void) => getLibraryHistoryStore().subscribe(listener);

const SERVER_SNAPSHOT: HistorySnapshot = { ready: false, entries: [] };

/** History entries, most recently played first. Not ready on the server and until read. */
export function useLibraryHistory(): HistorySnapshot & {
  remove(bookId: string): Promise<boolean>;
} {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getLibraryHistoryStore().getSnapshot(),
    () => SERVER_SNAPSHOT,
  );
  return {
    ...snapshot,
    remove: (bookId) => getLibraryHistoryStore().remove(bookId),
  };
}
