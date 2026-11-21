/**
 * A serverless instance can be frozen between requests. Timers do not run while it is frozen,
 * so the driver never notices that the pooler closed its socket, and the next query waits on
 * a dead connection until the function times out. A connection unused for longer than this is
 * replaced instead of trusted.
 */
export const MAX_IDLE_MS = 5_000;

export function isStale(lastUsedAt: number, now: number, maxIdleMs: number = MAX_IDLE_MS): boolean {
  return now - lastUsedAt > maxIdleMs;
}
