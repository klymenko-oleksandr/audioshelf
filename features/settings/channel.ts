/**
 * "Something changed, re-read the settings": how one tab tells the others. BroadcastChannel
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

export function createStorageEventChannel(): SettingsChannel {
  const listeners = new Set<() => void>();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_PING_KEY) return;
    for (const listener of listeners) listener();
  };
  window.addEventListener('storage', onStorage);

  return {
    post() {
      try {
        window.localStorage.setItem(STORAGE_PING_KEY, `${Date.now()}-${Math.random()}`);
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

export function createBrowserChannel(name = CHANNEL_NAME): SettingsChannel {
  if (typeof BroadcastChannel === 'undefined') return createStorageEventChannel();

  const channel = new BroadcastChannel(name);
  const listeners = new Set<() => void>();
  channel.onmessage = () => {
    for (const listener of listeners) listener();
  };

  return {
    post: () => channel.postMessage('changed'),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      channel.close();
      listeners.clear();
    },
  };
}
