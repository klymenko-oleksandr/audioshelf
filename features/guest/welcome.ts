/**
 * Welcome screen rules (PRD: System behaviours → Welcome; boards Welcome, MWelcome).
 *
 * - Guests see it once per browser; signed-in listeners once per account (Phase 6 fills in the
 *   account side, in `welcomeSeen` only).
 * - Never on a deep link: only the plain home page, as the first page of the visit.
 * - Skipping and finishing both count as seen.
 */

/** Written to localStorage once the welcome was seen, so the page can tell before first paint. */
export const WELCOME_MIRROR_KEY = 'audioshelf:welcome-seen';

/** A first page of exactly `/` — not `/book/...`, not `/#player`. */
export function isWelcomeLanding(pathname: string, hash: string): boolean {
  return pathname === '/' && hash === '';
}

export interface WelcomeSeenInput {
  /** This browser has seen it (Dexie, or the localStorage mirror). */
  browserSeen: boolean;
  /** The signed-in account's own flag (Phase 6a). `null` / absent for a guest. */
  account?: { seen: boolean } | null;
}

/** The one place that says "has this listener seen the welcome". */
export function welcomeSeen(input: WelcomeSeenInput): boolean {
  // Once per account: seen on any device counts. Seen in this browser also counts for the
  // account (the gate writes it back), so a listener who just saw it is not welcomed twice.
  return input.account ? input.account.seen || input.browserSeen : input.browserSeen;
}

export interface ShowWelcomeInput {
  /** `isWelcomeLanding` for the first page of this visit. */
  landing: boolean;
  seen: boolean;
  /**
   * Saved places, likes, Listen later or History already exist here: this is not a new
   * listener (they used the app before the welcome existed), so skip the introduction.
   */
  hasActivity: boolean;
}

export function shouldShowWelcome({ landing, seen, hasActivity }: ShowWelcomeInput): boolean {
  return landing && !seen && !hasActivity;
}

/**
 * Runs in `<head>` before the first paint (compare `THEME_INIT_SCRIPT`). When this is the home
 * page and the mirror does not say "seen", it sets `data-welcome="pending"` on `<html>`; the
 * splash then stays up until the app has decided (see `AppReady`), so a repeat visitor sees no
 * flash and a new one goes from splash to welcome with no glimpse of Home in between.
 * Plain ES5 on purpose; it must never throw. Blocked storage counts as "not seen yet".
 */
export const WELCOME_INIT_SCRIPT = `(function(){try{var l=location;if(l.pathname!=="/"||l.hash!=="")return;var s;try{s=localStorage.getItem(${JSON.stringify(
  WELCOME_MIRROR_KEY,
)})}catch(e){s=null}if(s!=="1")document.documentElement.setAttribute("data-welcome","pending")}catch(e){}})()`;

/** Remember in localStorage that the welcome was seen (the page script reads it next visit). */
export function writeWelcomeMirror(storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(WELCOME_MIRROR_KEY, '1');
  } catch {
    // Blocked or full: Dexie still remembers, the mirror just cannot save the next first paint.
  }
}
