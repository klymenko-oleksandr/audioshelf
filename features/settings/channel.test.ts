import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorageEventChannel, STORAGE_PING_KEY } from './channel';

afterEach(() => localStorage.clear());

describe('storage-event channel (browsers without BroadcastChannel)', () => {
  it('post() writes a ping that other tabs see as a storage event', () => {
    const channel = createStorageEventChannel();
    channel.post();
    expect(localStorage.getItem(STORAGE_PING_KEY)).not.toBeNull();
    channel.close();
  });

  it('calls subscribers when another tab pings, and ignores other keys', () => {
    const channel = createStorageEventChannel();
    const listener = vi.fn();
    channel.subscribe(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: '1' }));
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_PING_KEY, newValue: '2' }));
    expect(listener).toHaveBeenCalledTimes(1);
    channel.close();
  });

  it('stops listening after unsubscribe and after close', () => {
    const channel = createStorageEventChannel();
    const listener = vi.fn();
    const off = channel.subscribe(listener);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_PING_KEY, newValue: '3' }));
    expect(listener).not.toHaveBeenCalled();
    channel.close();
  });

  it('does not throw when storage is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => createStorageEventChannel().post()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});
