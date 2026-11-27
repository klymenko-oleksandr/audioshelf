/**
 * Whose data is in this browser's tables (Phase 6c): nobody's account (a guest) or one
 * account's. The outbox and the pull cursor are kept per account.
 */
import type { LocalDb } from '@/lib/local-db/db';
import {
  flagChange,
  historyChange,
  OWNER_KEY,
  outboxRow,
  progressChange,
  readOwner,
  settingChange,
  type Change,
} from './outbox';

export const cursorKey = (owner: string) => `syncCursor:${owner}`;

const dataTables = (db: LocalDb) => [
  db.progress,
  db.likes,
  db.listenLater,
  db.history,
  db.settings,
];

/**
 * A guest signed in: everything saved on this device now belongs to the account, and is queued
 * for the merge push. Removed rows are left out, so something a guest removed never removes it
 * from the account (the merge is a union). Only settings the listener has saved have rows.
 * Returns `false` when the tables already belong to this account.
 */
export function adopt(db: LocalDb, owner: string): Promise<boolean> {
  return db.transaction('rw', [...dataTables(db), db.meta, db.outbox], async () => {
    if ((await readOwner(db)) === owner) return false;
    await db.meta.put({ key: OWNER_KEY, value: owner });
    await db.meta.delete(cursorKey(owner));

    const live = <T extends { deletedAt?: number }>(rows: T[]) =>
      rows.filter((row) => row.deletedAt === undefined);
    const changes: (Change | null)[] = [
      ...live(await db.progress.toArray()).map(progressChange),
      ...live(await db.likes.toArray()).map((row) => flagChange('like', row)),
      ...live(await db.listenLater.toArray()).map((row) => flagChange('listen_later', row)),
      ...live(await db.history.toArray()).map(historyChange),
      ...(await db.settings.toArray()).map(settingChange),
    ];
    await db.outbox.bulkPut(
      changes.filter((c) => c !== null).map((change) => outboxRow(owner, change, true)),
    );
    return true;
  });
}

/**
 * Sign-out: a fresh guest. The account's rows leave the tables, with its pull cursor (the next
 * sign-in reads everything again). Changes that were not sent stay in the outbox under the
 * account and go out when it signs in again. The device id and the guest's own notes
 * (welcome, nudge) stay.
 */
export function release(db: LocalDb): Promise<void> {
  return db.transaction('rw', [...dataTables(db), db.meta], async () => {
    const owner = await readOwner(db);
    if (!owner) return;
    await Promise.all(dataTables(db).map((table) => table.clear()));
    await db.meta.bulkDelete([OWNER_KEY, cursorKey(owner)]);
  });
}
