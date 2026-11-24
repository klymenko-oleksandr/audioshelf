'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { AccountStore, type AccountSnapshot } from './store';
import { createSupabaseGateway } from './supabase-gateway';

let store: AccountStore | undefined;

/** The one store of this page. Without Supabase settings everyone is a guest. */
export function getAccountStore(): AccountStore {
  if (!store) {
    const client = getSupabaseBrowserClient();
    store = new AccountStore(
      client ? createSupabaseGateway(client, () => window.location.origin) : null,
    );
  }
  return store;
}

/** Tests hand in a store built on a fake gateway. */
export function setAccountStoreForTests(next: AccountStore): void {
  store?.dispose();
  store = next;
}

export function resetAccountStoreForTests(): void {
  store?.dispose();
  store = undefined;
}

/** Before hydration nobody is known yet: a guest nudge must not flash for a signed-in listener. */
const SERVER_SNAPSHOT: AccountSnapshot = { status: 'loading', account: null, available: true };

/** Who is listening: `loading`, `guest` or `signedIn` (with the account). */
export function useAccount(): AccountSnapshot {
  const account = getAccountStore();
  useEffect(() => {
    void account.load();
  }, [account]);
  return useSyncExternalStore(account.subscribe, account.getSnapshot, () => SERVER_SNAPSHOT);
}
