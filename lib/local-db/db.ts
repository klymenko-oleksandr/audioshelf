import Dexie, { type EntityTable } from 'dexie';
import type { ProgressRecord } from '@/features/player/storage/progress-store';
import type { FlagRecord, HistoryRecord, MetaRecord, SettingRecord } from './types';

export const DB_NAME = 'audioshelf';

/**
 * The app's IndexedDB database (ADR 4: local-first store).
 *
 * - v1 (Phase 2): `progress`.
 * - v2 (Phase 5a): `likes`, `listenLater`, `history`, `settings`, `meta`. Nothing in
 *   `progress` changes, so saved positions carry over untouched. The sync outbox joins in
 *   Phase 6 as version 3.
 *
 * Only indexed fields are listed in `stores()`; the rows may carry more (see `types.ts`).
 */
export class LocalDb extends Dexie {
  progress!: EntityTable<ProgressRecord, 'bookId'>;
  likes!: EntityTable<FlagRecord, 'bookId'>;
  listenLater!: EntityTable<FlagRecord, 'bookId'>;
  history!: EntityTable<HistoryRecord, 'bookId'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      progress: 'bookId, updatedAt',
    });
    this.version(2).stores({
      likes: 'bookId, addedAt, updatedAt',
      listenLater: 'bookId, addedAt, updatedAt',
      history: 'bookId, lastPlayedAt, updatedAt',
      settings: 'key, updatedAt',
      meta: 'key',
    });
  }
}
