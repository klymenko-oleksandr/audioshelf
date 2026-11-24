'use client';

import { useSyncExternalStore } from 'react';
import { createBrowserChannel } from '@/features/settings/channel';
import { getLocalDb } from '@/lib/local-db/shared';
import { createDexieGuestRepo, GuestStore, type GuestSnapshot } from './store';

/** Pings between tabs (own names, so they never wake the library or Settings listeners). */
const CHANNEL_NAME = 'audioshelf-guest';
const STORAGE_PING_KEY = 'audioshelf:guest-ping';

let store: GuestStore | null = null;

/** This tab's welcome / nudge state. Created on first use in the browser; reads Dexie at once. */
export function getGuestStore(): GuestStore {
  if (typeof window === 'undefined') throw new Error('Guest state only exists in the browser.');
  if (store) return store;

  store = new GuestStore({
    repo: createDexieGuestRepo(getLocalDb()),
    channel: createBrowserChannel(CHANNEL_NAME, STORAGE_PING_KEY),
  });
  void store.load();
  return store;
}

/** For tests: drop this tab's store so the next use starts fresh. */
export function resetGuestStoreForTests(): void {
  store?.dispose();
  store = null;
}

const subscribe = (listener: () => void) => getGuestStore().subscribe(listener);

/** Nothing known, not ready: what the server and hydration render. */
const SERVER_SNAPSHOT: GuestSnapshot = {
  ready: false,
  welcomeSeen: false,
  hasActivity: false,
  nudge: { actions: 0 },
};

export function useGuest(): GuestSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => getGuestStore().getSnapshot(),
    () => SERVER_SNAPSHOT,
  );
}
