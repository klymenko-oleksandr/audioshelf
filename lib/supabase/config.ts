/**
 * Supabase Auth settings for listeners (ADR 5). Both values are public by design (the key is
 * the *publishable* one, never the secret key). Missing or malformed values switch sign-in off
 * instead of crashing the app: the listener app keeps working as guests.
 */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function readSupabaseConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabaseConfig | null {
  const key = publishableKey?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return null;
    return { url: parsed.origin, publishableKey: key };
  } catch {
    return null;
  }
}

/** Next.js only inlines `NEXT_PUBLIC_*` values when they are read by their full name. */
export function getSupabaseConfig(): SupabaseConfig | null {
  return readSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
