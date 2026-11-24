import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema';

/** What Supabase has and PGlite lacks: `auth.users(id)` and the two API roles. */
export const SUPABASE_STUBS = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  END $$;
`;

/**
 * A real Postgres (PGlite: Postgres compiled to WebAssembly) in memory, with every
 * migration from `db/migrations` applied. For integration tests of database code; the
 * production client in `lib/db` is never involved.
 */
export async function createTestDb() {
  const client = await PGlite.create({ extensions: { pg_trgm, unaccent } });
  // Supabase provides these; plain Postgres (PGlite) does not. Migration 0006 references
  // `auth.users` and revokes from the API roles, so the tests create the minimum it needs.
  await client.exec(SUPABASE_STUBS);
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
