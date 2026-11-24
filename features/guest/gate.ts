/**
 * The hand-off between the page script, the welcome screen and the splash.
 *
 * `<html data-welcome>`:
 *   pending  set before the first paint on the home page when the welcome might be due; the
 *            splash waits (see `AppReady`) so Home never shows for a moment first
 *   open     the welcome screen is up
 *   (absent) decided: nothing to show, or already shown
 */

export const WELCOME_ATTRIBUTE = 'welcome';
export const WELCOME_RESOLVED_EVENT = 'audioshelf:welcome-resolved';
/** The splash never waits longer than this for the welcome decision. */
export const WELCOME_GATE_MAX_MS = 1500;

export type WelcomeGateState = 'pending' | 'open' | 'done';

export function readWelcomeGate(root: HTMLElement = document.documentElement): string | undefined {
  return root.dataset[WELCOME_ATTRIBUTE];
}

/** Records the decision on `<html>` and wakes anything waiting for it (the splash). */
export function setWelcomeGate(
  state: Exclude<WelcomeGateState, 'pending'>,
  root: HTMLElement = document.documentElement,
): void {
  if (state === 'done') delete root.dataset[WELCOME_ATTRIBUTE];
  else root.dataset[WELCOME_ATTRIBUTE] = state;
  window.dispatchEvent(new Event(WELCOME_RESOLVED_EVENT));
}
