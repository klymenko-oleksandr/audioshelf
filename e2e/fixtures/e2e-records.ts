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
