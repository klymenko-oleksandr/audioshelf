import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { classifyDb, DB_CHECK_TIMEOUT_MS } from '@/lib/health';
import { withTimeout } from '@/lib/with-timeout';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — is the app up, and can it reach the database? Public and secret-free: the
 * side-screen dashboard and any uptime monitor poll it. If `app` is ok and `db` is not, the
 * database or pooler is the problem; if the request itself fails, the app or Vercel is.
 */
export async function GET() {
  const started = Date.now();
  let result: { ms: number } | { failed: true };
  try {
    await withTimeout(getDb().execute(sql`select 1`), DB_CHECK_TIMEOUT_MS, 'Health check');
    result = { ms: Date.now() - started };
  } catch {
    result = { failed: true };
  }
  const health = classifyDb(result);
  return NextResponse.json(
    {
      app: 'ok',
      ...health,
      region: process.env.VERCEL_REGION ?? null,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checkedAt: new Date().toISOString(),
    },
    {
      status: health.db === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
