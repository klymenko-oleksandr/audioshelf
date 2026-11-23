import type { LocalDb } from '@/lib/local-db/db';
import type { SettingRecord } from '@/lib/local-db/types';
import type { SettingsChannel } from './channel';
import {
  DEFAULT_SETTINGS,
  parseSetting,
  resolveSettings,
  type SettingKey,
  type Settings,
} from './definitions';

export interface SettingsRepo {
  load(): Promise<SettingRecord[]>;
  put(record: SettingRecord): Promise<void>;
}

export function createDexieSettingsRepo(db: LocalDb): SettingsRepo {
  return {
    load: () => db.settings.toArray(),
    put: async (record) => {
      await db.settings.put(record);
    },
  };
}

export interface SettingsStoreOptions {
  repo: SettingsRepo;
  deviceId: () => Promise<string>;
  /** Tells other tabs about a change, and tells this one about theirs. */
  channel?: SettingsChannel;
  now?: () => number;
}

/**
 * The settings of this device: read from Dexie, changed immediately in memory, written
 * behind. Framework-free; React reads it through `subscribe` / `getSnapshot`.
 *
 * - `getSnapshot()` is always complete (defaults filled in) and keeps its identity until
 *   something actually changes, as `useSyncExternalStore` needs.
 * - A change is visible at once. If storage fails the value still holds for the session.
 * - Another tab's change arrives through the channel; this store re-reads Dexie.
 * - Each saved setting is its own row with `updatedAt` and `deviceId`, ready for Phase 6's
 *   per-setting last-write-wins.
 */
export class SettingsStore {
  private snapshot: Settings = DEFAULT_SETTINGS;
  private loaded = false;
  /** What storage holds, with defaults filled in. */
  private stored: Settings = DEFAULT_SETTINGS;
  /** Changes made here that storage may not have confirmed yet; they win over a read. */
  private readonly unsaved = new Map<SettingKey, unknown>();
  private readonly listeners = new Set<() => void>();
  private readonly stopListening: (() => void) | undefined;

  constructor(private readonly options: SettingsStoreOptions) {
    this.stopListening = options.channel?.subscribe(() => void this.load());
  }

  getSnapshot = (): Settings => this.snapshot;

  /** True once storage has been read (or has failed), so the snapshot can be trusted. */
  isLoaded = (): boolean => this.loaded;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read storage. A failure leaves the current values in place. */
  async load(): Promise<void> {
    let rows: SettingRecord[];
    try {
      rows = await this.options.repo.load();
    } catch (error) {
      console.warn('Settings storage is unavailable; keeping settings in memory.', error);
      this.markLoaded();
      return;
    }
    this.stored = resolveSettings(rows);
    this.publish();
    this.markLoaded();
  }

  /** Change one setting. `false` (and no change) when the value is not valid for the key. */
  async set<K extends SettingKey>(key: K, value: Settings[K]): Promise<boolean> {
    const parsed = parseSetting(key, value);
    if (parsed === undefined) return false;

    this.unsaved.set(key, parsed);
    this.publish();

    try {
      const deviceId = await this.options.deviceId();
      await this.options.repo.put({
        key,
        value: parsed,
        updatedAt: (this.options.now ?? Date.now)(),
        deviceId,
      });
      this.stored = { ...this.stored, [key]: parsed };
      if (this.unsaved.get(key) === parsed) this.unsaved.delete(key);
      this.options.channel?.post();
    } catch (error) {
      // Keep the value for this session; it just will not survive a reload.
      console.warn('Could not save the setting.', error);
    }
    return true;
  }

  dispose(): void {
    this.stopListening?.();
    this.options.channel?.close();
    this.listeners.clear();
  }

  private markLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    for (const listener of this.listeners) listener();
  }

  private publish(): void {
    const next: Settings = { ...this.stored };
    for (const [key, value] of this.unsaved) {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
    const changed = (Object.keys(next) as SettingKey[]).some(
      (key) => next[key] !== this.snapshot[key],
    );
    if (!changed) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
