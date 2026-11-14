import 'server-only';

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { requireEnv } from '@/lib/env';

export type Database = PostgresJsDatabase<typeof schema>;

// Survive Next.js hot reloads in dev without leaking connections.
const globalForDb = globalThis as unknown as { __audioshelfDb?: Database };

/**
 * Server-only database handle (ADR 4: the browser never queries tables).
 * Created lazily so importing this module never needs DATABASE_URL.
 */
export function getDb(): Database {
  if (!globalForDb.__audioshelfDb) {
    const client = postgres(requireEnv('DATABASE_URL'), {
      // Supabase's transaction pooler (port 6543) does not support prepared statements.
      prepare: false,
      max: process.env.NODE_ENV === 'production' ? 1 : 5,
    });
    globalForDb.__audioshelfDb = drizzle(client, { schema });
  }
  return globalForDb.__audioshelfDb;
}
