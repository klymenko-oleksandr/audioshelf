import postgres from 'postgres';

/**
 * The write tests create books, authors and narrators in the throwaway end-to-end database and
 * give them all names starting with this prefix, so they can be removed afterwards. The
 * read-only specs assert exact counts of the seeded catalogue and must never see them.
 */
export const E2E_PREFIX = 'E2E ';
const E2E_DB_PORT = 54329;

/** True when the run targets a deployed site (PLAYWRIGHT_BASE_URL): writing tests must not run there. */
export const TARGETS_DEPLOYMENT = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export async function removeE2eRecords(): Promise<void> {
  if (TARGETS_DEPLOYMENT) return;
  const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`, {
    max: 1,
    prepare: false,
  });
  try {
    const like = `${E2E_PREFIX}%`;
    await sql`delete from books where title like ${like}`;
    await sql`delete from authors where name like ${like}`;
    await sql`delete from narrators where name like ${like}`;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/** Runs a query against the throwaway end-to-end database (never a deployment). */
export async function withE2eSql<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  if (TARGETS_DEPLOYMENT)
    throw new Error('The end-to-end database is not reachable from a deployment run.');
  const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`, {
    max: 1,
    prepare: false,
  });
  try {
    return await run(sql);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

/** What the fake storage (scripts/e2e-r2.mjs) did with uploads whose key contains `contains`. */
export async function r2State(contains: string): Promise<{
  open: number;
  completed: number;
  aborted: number;
  partPuts: number;
  objects: string[];
}> {
  const response = await fetch(
    `http://127.0.0.1:54330/__state?contains=${encodeURIComponent(contains)}`,
  );
  return response.json();
}
