/** The signed-in listener, as the app needs to know them (Phase 6a). Pure; no Supabase imports. */

/** The few fields of a Supabase user we read. */
export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface Account {
  id: string;
  email: string;
  /** Display name from the Google profile; the part of the email before "@" if there is none. */
  name: string;
  avatarUrl: string | null;
  /** This account has already seen the welcome screen on some device. */
  welcomeSeen: boolean;
}

/** The metadata key that holds "the welcome was seen" (a timestamp). */
export const WELCOME_SEEN_METADATA_KEY = 'welcomeSeenAt';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

export function welcomeSeenOnAccount(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.[WELCOME_SEEN_METADATA_KEY] === 'number';
}

export function accountFromUser(user: AuthUser): Account {
  const meta = user.user_metadata ?? {};
  const email = text(user.email);
  return {
    id: user.id,
    email,
    name: text(meta.full_name) || text(meta.name) || email.split('@')[0] || '',
    avatarUrl: httpsUrl(meta.avatar_url) ?? httpsUrl(meta.picture),
    welcomeSeen: welcomeSeenOnAccount(meta),
  };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export type GreetingKey = 'morning' | 'afternoon' | 'evening';

/** Home's greeting for a signed-in listener (board Main: "Good evening, Sasha"). */
export function greetingKey(hour: number): GreetingKey {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
