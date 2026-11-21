export const SLOW_DB_MS = 500;
export const DB_CHECK_TIMEOUT_MS = 2_000;

export type DbHealth = { db: 'ok' | 'slow' | 'down'; dbMs: number | null };

/** Turns one database check into the state shown to monitors and the side-screen dashboard. */
export function classifyDb(result: { ms: number } | { failed: true }): DbHealth {
  if ('failed' in result) return { db: 'down', dbMs: null };
  return { db: result.ms >= SLOW_DB_MS ? 'slow' : 'ok', dbMs: result.ms };
}
