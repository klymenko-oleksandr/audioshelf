import { revalidateCatalogue } from '@/features/admin/revalidate';
import { r2ImportStorage } from '@/features/admin/import/storage';
import type { ImportDeps } from '@/features/admin/import/handlers';
import { IMPORT_TOKEN_ENV } from '@/lib/auth/admin/import-token';
import { getDb, readDb } from '@/lib/db';

/** The real database, bucket and token for the import routes. Built per request: env is read late. */
export function importDeps(): ImportDeps {
  return {
    db: getDb,
    readDb,
    storage: r2ImportStorage,
    revalidate: revalidateCatalogue,
    token: process.env[IMPORT_TOKEN_ENV],
  };
}
