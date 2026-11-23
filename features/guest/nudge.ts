/**
 * The guest sign-in nudge (PRD: Identity and auth → Guest limits and nudge; boards GuestNudge,
 * MGuestNudge). Pure rules, no storage and no React.
 *
 * - One counter for every like or Listen later *add* made in this browser (both kinds together).
 *   Unliking or removing never lowers it.
 * - Due from the 3rd add. After "Not now" it is due again 7 days later, or after 10 more adds,
 *   whichever comes first.
 */

export const NUDGE_THRESHOLD = 3;
export const NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const NUDGE_SNOOZE_ACTIONS = 10;

export interface NudgeState {
  /** Likes and Listen later adds made in this browser, ever. */
  actions: number;
  /** When the nudge was last dismissed. */
  dismissedAt?: number;
  /** The counter at that moment. */
  actionsAtDismiss?: number;
}

export function recordAdd(state: NudgeState): NudgeState {
  return { ...state, actions: state.actions + 1 };
}

export function dismissNudge(state: NudgeState, now: number): NudgeState {
  return { actions: state.actions, dismissedAt: now, actionsAtDismiss: state.actions };
}

/** Has the listener done enough, and is any snooze over? (Says nothing about where we are.) */
export function nudgeDue(state: NudgeState, now: number): boolean {
  if (state.actions < NUDGE_THRESHOLD) return false;
  if (state.dismissedAt === undefined) return true;

  const waited = now - state.dismissedAt;
  const since = state.actions - (state.actionsAtDismiss ?? state.actions);
  return waited >= NUDGE_SNOOZE_MS || since >= NUDGE_SNOOZE_ACTIONS;
}

function count(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

/** Reads what storage holds; anything unexpected is repaired rather than trusted. */
export function parseNudgeState(raw: unknown): NudgeState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { actions: 0 };
  const row = raw as Record<string, unknown>;

  const actions = count(row.actions) ?? 0;
  const dismissedAt =
    typeof row.dismissedAt === 'number' && Number.isFinite(row.dismissedAt)
      ? row.dismissedAt
      : undefined;
  if (dismissedAt === undefined) return { actions };

  const atDismiss = Math.min(count(row.actionsAtDismiss) ?? actions, actions);
  return { actions, dismissedAt, actionsAtDismiss: atDismiss };
}

export interface NudgeVisibilityInput {
  /** `nudgeDue(...)` for the current state. */
  due: boolean;
  /** Storage has been read, so the counter can be trusted. */
  ready: boolean;
  /** Signed-in listeners are never nudged (no accounts before Phase 6, so always true now). */
  guest: boolean;
  /** The full-screen player is open. */
  playerOpen: boolean;
  /** A toast (for example "Added to Liked" with Undo) is on screen: toasts are one at a time. */
  toastVisible: boolean;
  /** The welcome screen is open. */
  welcomeOpen: boolean;
  pathname: string;
}

export function nudgeVisible(input: NudgeVisibilityInput): boolean {
  if (!input.due || !input.ready || !input.guest) return false;
  if (input.playerOpen || input.toastVisible || input.welcomeOpen) return false;
  // On the sign-in page the nudge would point at itself.
  return !(input.pathname === '/signin' || input.pathname.startsWith('/signin/'));
}

/** `/signin?next=` with the current page, or plain `/signin` when there is nothing safe to keep. */
export function signinHref(pathname: string, search: string): string {
  const safe = pathname.startsWith('/') && !pathname.startsWith('//');
  const onSignin = pathname === '/signin' || pathname.startsWith('/signin/');
  if (!safe || onSignin) return '/signin';

  const query = search === '' || search.startsWith('?') ? search : `?${search}`;
  return `/signin?next=${encodeURIComponent(pathname + (query === '?' ? '' : query))}`;
}
