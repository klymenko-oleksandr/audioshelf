'use client';

/** The sync client of this tab, bound to the browser and the app's stores. */
import { getAccountStore } from '@/features/account/use-account';
import type { AccountStore } from '@/features/account/store';
import { getGuestStore } from '@/features/guest/use-guest';
import { getLibraryFlagsStore } from '@/features/library/flags/use-library-flags';
import { getLibraryHistoryStore } from '@/features/library/history/use-library-history';
import { wantsToPlay } from '@/features/player/core';
import { announceLibraryChange, getPlayer } from '@/features/player/player';
import { createBrowserChannel } from '@/features/settings/channel';
import { getSettingsStore } from '@/features/settings/use-settings';
import { getLocalDb } from '@/lib/local-db/shared';
import type { ChangedKind } from './apply';
import { SyncClient, type SyncAccount, type SyncPlayer } from './client';
import { setTabOwner } from './tab-owner';
import { deviceName } from './wire';

export function syncAccount(store: AccountStore): SyncAccount {
  return {
    getState() {
      const snapshot = store.getSnapshot();
      if (snapshot.status === 'signedIn') return { status: 'signedIn', id: snapshot.account.id };
      return store.isSessionKnown() ? { status: 'signedOut' } : { status: 'unknown' };
    },
    subscribe: (listener) => store.subscribe(listener),
  };
}

function syncPlayer(): SyncPlayer {
  const player = getPlayer();
  return {
    flush: () => player.flush(),
    // After the first read of the saved places, which would otherwise overwrite this one.
    refresh: () => player.init().then(() => player.refreshProgress()),
    reset: () => player.reset(),
    getState() {
      const { status, book, chapterIndex } = player.getState();
      return { playing: wantsToPlay(status), bookId: book?.id ?? null, chapterIndex };
    },
    subscribe: (listener) => player.subscribe(listener),
  };
}

/** This tab's stores read the tables again, and the other tabs are told to. */
function storesChanged() {
  const channels = [
    createBrowserChannel('audioshelf-settings', 'audioshelf:settings-ping'),
    createBrowserChannel('audioshelf-guest', 'audioshelf:guest-ping'),
  ];
  return async (kinds: ReadonlySet<ChangedKind>) => {
    await Promise.all([
      getLibraryFlagsStore().load(),
      getLibraryHistoryStore().load(),
      getSettingsStore().load(),
      getGuestStore().load(),
    ]);
    if (kinds.has('progress') || kinds.has('flags') || kinds.has('history')) {
      announceLibraryChange();
    }
    for (const channel of channels) channel.post();
  };
}

/** Start syncing. Returns the function that stops it. */
export function startSync(): () => void {
  const account = getAccountStore();
  const client = new SyncClient({
    db: getLocalDb(),
    fetch: (url, init) => window.fetch(url, init),
    beacon: (url, body) =>
      navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' })) ?? false,
    now: Date.now,
    account: syncAccount(account),
    player: syncPlayer(),
    deviceName: deviceName(navigator.userAgent),
    onChanged: storesChanged(),
    setTabOwner,
  });

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      void client.hidden().catch((error) => console.warn('Could not send the changes.', error));
    } else void client.focused();
  };
  const onFocus = () => void client.focused();
  const onOnline = () => void client.reconnected();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  const stopSignOut = account.onBeforeSignOut(() => client.beforeSignOut());

  void account.load();
  void client.start().catch((error) => console.warn('Sync could not start.', error));

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
    stopSignOut();
    client.dispose();
  };
}
