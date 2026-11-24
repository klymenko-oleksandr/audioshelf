import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';

let client: SupabaseClient | null | undefined;

/** The one browser client (it keeps the session cookie fresh), or `null` when sign-in is off. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = getSupabaseConfig();
  client = config ? createBrowserClient(config.url, config.publishableKey) : null;
  return client;
}
