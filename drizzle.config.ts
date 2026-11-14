import { defineConfig } from 'drizzle-kit';

// drizzle-kit loads .env itself only via this file, so read it explicitly for local runs.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env (CI, Vercel) — rely on real environment variables.
}

// Migrations want a session-mode connection (Supabase pooler port 5432 or the direct host).
const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.warn('DATABASE_URL is not set — only `drizzle-kit generate` will work.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: { url: url ?? 'postgresql://missing-DATABASE_URL' },
  // Keep the bookkeeping table in `public` so the app owns a single schema.
  migrations: { schema: 'public', table: '__drizzle_migrations' },
  // v1 tables live in `legacy_v1`; drizzle-kit must never try to manage them.
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});
