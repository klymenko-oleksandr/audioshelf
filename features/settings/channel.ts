/**
 * "Something changed, re-read it": how one tab tells the others (settings; since 5b also
 * likes and Listen later). BroadcastChannel
 * where it exists; otherwise a ping written to localStorage, which other tabs see as a
 * `storage` event (old Safari). The message carries no data — the receiver re-reads Dexie,
 * the source of truth.
 */
export interface SettingsChannel {
  post(): void;
  /** Called when *another* tab posts. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  close(): void;
}

export const CHANNEL_NAME = 'audioshelf-settings';
export const STORAGE_PING_KEY = 'audioshelf:settings-ping';

export function createStorageEventChannel(storageKey = STORAGE_PING_KEY): SettingsChannel {
  const listeners = new Set<() => void>();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    for (const listener of listeners) listener();
  };
  window.addEventListener('storage', onStorage);

  return {
    post() {
      try {
        window.localStorage.setItem(storageKey, `${Date.now()}-${Math.random()}`);
      } catch {
        // Blocked storage: other tabs just will not hear about it until they reload.
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      window.removeEventListener('storage', onStorage);
      listeners.clear();
    },
  };
}

/**
 * `name` and `storageKey` keep one feature's pings apart from another's (Settings uses the
 * defaults; the library flags use their own).
 */
export function createBrowserChannel(
  name = CHANNEL_NAME,
  storageKey = STORAGE_PING_KEY,
): SettingsChannel {
  if (typeof BroadcastChannel === 'undefined') return createStorageEventChannel(storageKey);

  const channel = new BroadcastChannel(name);
  const listeners = new Set<() => void>();
  channel.onmessage = () => {
    for (const listener of listeners) listener();
  };

  let closed = false;

  return {
    // A save can finish after the owner closed the channel (page teardown); that is not an error.
    post: () => {
      if (!closed) channel.postMessage('changed');
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      channel.close();
      listeners.clear();
    },
  };
}
