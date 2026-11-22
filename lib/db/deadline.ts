import { withTimeout } from '@/lib/with-timeout';

export const QUERY_DEADLINE_MS = 4_000;

interface Deps<D> {
  /** The current database handle. */
  getHandle: () => D;
  /** Drops the current connection so the next `getHandle()` opens a fresh one. */
  reset: () => void;
  ms?: number;
  attempts?: number;
  log?: (line: string) => void;
}

/**
 * Runs read-only work against the database with a deadline. Through the pooler a query can
 * occasionally never come back (production, 21-22 Nov: the page streamed forever until the
 * function was killed after 300 s). A normal query takes tens of milliseconds, so when the
 * deadline passes we drop the connection and try once more on a fresh one; if that fails too,
 * the error reaches the page's error screen instead of an endless skeleton.
 *
 * Only for reads: a retry runs the work again.
 */
export async function withDeadline<D, T>(
  label: string,
  run: (db: D) => Promise<T>,
  {
    getHandle,
    reset,
    ms = QUERY_DEADLINE_MS,
    attempts = 2,
    log = (line) => console.warn(line),
  }: Deps<D>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(run(getHandle()), ms, label);
    } catch (error) {
      lastError = error;
      const reason = error instanceof Error ? error.message : String(error);
      log(`[db] ${label} attempt ${attempt}/${attempts} failed: ${reason}`);
      // A hung or broken connection is not worth trusting again; a real SQL error will simply fail again.
      reset();
    }
  }
  throw lastError;
}
