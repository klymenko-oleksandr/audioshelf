'use client';

import { useEffect } from 'react';
import { startSync } from '../client/browser';

/** Runs sync while the listener app is open. A guest makes no requests. Renders nothing. */
export function SyncRunner() {
  useEffect(() => {
    // Without IndexedDB nothing is kept on the device, so there is nothing to sync.
    if (typeof indexedDB === 'undefined') return;
    return startSync();
  }, []);
  return null;
}
