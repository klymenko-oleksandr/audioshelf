import type { LocalDb } from './db';

const KEY = 'deviceId';

/**
 * This browser's device id: a random UUID created on first use and kept in `meta`.
 * Rows written here carry it, and Phase 6 uses it to tell devices apart (conflict prompt,
 * "written by another device"). The check runs again inside the transaction, so two tabs
 * starting at the same moment end up with one id.
 */
export async function getDeviceId(db: LocalDb): Promise<string> {
  const found = await db.meta.get(KEY);
  if (typeof found?.value === 'string') return found.value;

  return db.transaction('rw', db.meta, async () => {
    const again = await db.meta.get(KEY);
    if (typeof again?.value === 'string') return again.value;
    const id = crypto.randomUUID();
    await db.meta.put({ key: KEY, value: id });
    return id;
  });
}
