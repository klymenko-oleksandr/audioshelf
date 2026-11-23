'use client';

import { useSyncExternalStore } from 'react';
import { getLocalDb } from '@/lib/local-db/shared';
import { getDeviceId } from '@/lib/local-db/device';
import { createBrowserChannel } from './channel';
import { DEFAULT_SETTINGS, type Settings } from './definitions';
import { createDexieSettingsRepo, SettingsStore } from './store';

let store: SettingsStore | null = null;

/**
 * This tab's settings store. Created on first use in the browser; it reads Dexie at once
 * and listens for changes made in other tabs.
 */
export function getSettingsStore(): SettingsStore {
  if (typeof window === 'undefined') throw new Error('Settings only exist in the browser.');
  if (store) return store;

  const db = getLocalDb();
  store = new SettingsStore({
    repo: createDexieSettingsRepo(db),
    deviceId: () => getDeviceId(db),
    channel: createBrowserChannel(),
  });
  void store.load();
  return store;
}

/** For code outside React (the player engine): the current settings. */
export const getSettings = (): Settings => getSettingsStore().getSnapshot();

const subscribe = (listener: () => void) => getSettingsStore().subscribe(listener);

/** Live settings. The defaults on the server and during hydration. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    subscribe,
    () => getSettingsStore().getSnapshot(),
    () => DEFAULT_SETTINGS,
  );
}

/** False until storage has been read; the Settings page waits for it so controls don't jump. */
export function useSettingsLoaded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSettingsStore().isLoaded(),
    () => false,
  );
}
