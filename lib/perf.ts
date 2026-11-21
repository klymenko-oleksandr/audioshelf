interface Options {
  log?: (line: string) => void;
  now?: () => number;
  region?: string | undefined;
}

/**
 * Runs `work` and logs one line with how long it took and which Vercel region served it
 * (`[perf] page.books-list 235ms region=fra1`). Search the runtime logs for `[perf]`.
 */
export async function timed<T>(
  label: string,
  work: () => Promise<T>,
  {
    log = (line) => console.info(line),
    now = () => performance.now(),
    region = process.env.VERCEL_REGION,
  }: Options = {},
): Promise<T> {
  const where = `region=${region ?? 'local'}`;
  const started = now();
  try {
    const result = await work();
    log(`[perf] ${label} ${Math.round(now() - started)}ms ${where}`);
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`[perf] ${label} failed after ${Math.round(now() - started)}ms ${where}: ${reason}`);
    throw error;
  }
}
