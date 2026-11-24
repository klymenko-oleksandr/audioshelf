import type { SyncDeps } from '@/features/sync/handlers';
import { getDb, readDb } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The real database and the Supabase session for the sync routes. Built per request.
 * The listener comes from `auth.getUser()`, which asks Supabase to verify the token; never
 * `getSession()` on the server, whose data is only what the cookie says.
 */
export function syncDeps(): SyncDeps {
  return {
    resolveUser: async () => {
      const supabase = await createSupabaseServerClient();
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    db: getDb,
    readDb,
  };
}
