import 'server-only';

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { requireEnv } from '@/lib/env';
import { isStale } from './freshness';
import { clientOptions } from './options';

export type Database = PostgresJsDatabase<typeof schema>;

type Holder = {
  client: ReturnType<typeof postgres>;
  db: Database;
  lastUsedAt: number;
};

// Survive Next.js hot reloads in dev without leaking connections.
const globalForDb = globalThis as unknown as { __audioshelfDb?: Holder };

function open(): Holder {
  const holder = {} as Holder;
  holder.client = postgres(requireEnv('DATABASE_URL'), {
    ...clientOptions(process.env.NODE_ENV === 'production'),
    // Every query the driver sends counts as use, so a slow page keeps its connection.
    debug: () => {
      holder.lastUsedAt = Date.now();
    },
  });
  holder.db = drizzle(holder.client, { schema, casing: 'snake_case' });
  holder.lastUsedAt = Date.now();
  return holder;
}

/**
 * Server-only database handle (ADR 4: the browser never queries tables).
 * Created lazily so importing this module never needs DATABASE_URL. A handle that has not
 * been asked for in a few seconds is replaced: the instance may have been frozen meanwhile
 * and its sockets closed by the pooler (see `freshness.ts`).
 */
export function getDb(): Database {
  const now = Date.now();
  const current = globalForDb.__audioshelfDb;
  if (current && !isStale(current.lastUsedAt, now)) {
    current.lastUsedAt = now;
    return current.db;
  }
  if (current) {
    // Queries already running on the old connection finish first, then its sockets close.
    // (A timeout here would cut them off: it broke the books list on 22 Nov.)
    void current.client.end().catch(() => {});
  }
  const fresh = open();
  globalForDb.__audioshelfDb = fresh;
  return fresh.db;
}
