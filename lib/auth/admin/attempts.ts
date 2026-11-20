import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { reserveAttempt, type Reservation } from './lockout';

export type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>;

const { adminLoginAttempts } = schema;
const KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * Takes one login attempt for `key` and says whether it may go ahead. The row is locked
 * for the length of the transaction, so simultaneous requests from one address are counted
 * one at a time.
 */
export function reserveLoginAttempt(
  db: AuthDb,
  key: string,
  now: Date = new Date(),
): Promise<Reservation> {
  return db.transaction(async (tx) => {
    await tx.insert(adminLoginAttempts).values({ key }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.key, key))
      .for('update');
    const reservation = reserveAttempt(
      {
        failedCount: row!.failedCount,
        lastAttemptAt: row!.lastAttemptAt,
        lockedUntil: row!.lockedUntil,
      },
      now,
    );
    if (reservation.allowed) {
      await tx
        .update(adminLoginAttempts)
        .set(reservation.next)
        .where(eq(adminLoginAttempts.key, key));
    }
    return reservation;
  });
}

/** A correct password wipes the address's history. */
export async function clearAttempts(db: AuthDb, key: string): Promise<void> {
  await db.delete(adminLoginAttempts).where(eq(adminLoginAttempts.key, key));
}

/** Rows idle for a day are of no use; locks still running are kept. */
export async function purgeOldAttempts(db: AuthDb, now: Date = new Date()): Promise<void> {
  await db
    .delete(adminLoginAttempts)
    .where(
      and(
        lt(adminLoginAttempts.lastAttemptAt, new Date(now.getTime() - KEEP_MS)),
        or(isNull(adminLoginAttempts.lockedUntil), lt(adminLoginAttempts.lockedUntil, now)),
      ),
    );
}
