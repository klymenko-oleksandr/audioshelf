import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';

/**
 * A real Postgres (PGlite: Postgres compiled to WebAssembly) in memory, with every
 * migration from `db/migrations` applied. For integration tests of database code; the
 * production client in `lib/db` is never involved.
 */
export async function createTestDb() {
  const client = await PGlite.create({ extensions: { pg_trgm, unaccent } });
  const dir = join(process.cwd(), 'db', 'migrations');
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(dir, `${tag}.sql`), 'utf8');
    await client.exec(sql.replaceAll('--> statement-breakpoint', ''));
  }
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client, close: () => client.close() };
}
