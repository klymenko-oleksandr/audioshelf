import { describe, expect, it } from 'vitest';
import {
  NUDGE_SNOOZE_ACTIONS,
  NUDGE_SNOOZE_MS,
  NUDGE_THRESHOLD,
  dismissNudge,
  nudgeDue,
  nudgeVisible,
  parseNudgeState,
  recordAdd,
  signinHref,
  type NudgeState,
} from './nudge';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

function after(actions: number, from: NudgeState = { actions: 0 }): NudgeState {
  let state = from;
  for (let i = 0; i < actions; i += 1) state = recordAdd(state);
  return state;
}

describe('nudgeDue: first time', () => {
  it('is not due before the 3rd action', () => {
    expect(nudgeDue(after(0), T0)).toBe(false);
    expect(nudgeDue(after(NUDGE_THRESHOLD - 1), T0)).toBe(false);
  });

  it('is due on the 3rd action and stays due until dismissed', () => {
    expect(NUDGE_THRESHOLD).toBe(3);
    expect(nudgeDue(after(3), T0)).toBe(true);
    expect(nudgeDue(after(8), T0 + 40 * DAY)).toBe(true);
  });

  it('counts likes and Listen later together (one counter)', () => {
    // Two likes and one Listen later are three adds, whatever the kind.
    expect(nudgeDue(after(3), T0)).toBe(true);
  });
});

describe('nudgeDue: after a dismissal', () => {
  const dismissed = dismissNudge(after(3), T0);

  it('hides right after Not now', () => {
    expect(nudgeDue(dismissed, T0)).toBe(false);
    expect(nudgeDue(dismissed, T0 + 1000)).toBe(false);
  });

  it('comes back after 7 days with no more actions', () => {
    expect(NUDGE_SNOOZE_MS).toBe(7 * DAY);
    expect(nudgeDue(dismissed, T0 + 7 * DAY - 1)).toBe(false);
    expect(nudgeDue(dismissed, T0 + 7 * DAY)).toBe(true);
  });

  it('comes back after 10 more actions, before 7 days', () => {
    expect(NUDGE_SNOOZE_ACTIONS).toBe(10);
    expect(nudgeDue(after(9, dismissed), T0 + DAY)).toBe(false);
    expect(nudgeDue(after(10, dismissed), T0 + DAY)).toBe(true);
  });

  it('whichever comes first: 7 days wins when there were few actions', () => {
    expect(nudgeDue(after(2, dismissed), T0 + 7 * DAY)).toBe(true);
  });

  it('counts actions since the dismissal, not in total', () => {
    const later = dismissNudge(after(20), T0);
    expect(nudgeDue(after(9, later), T0 + DAY)).toBe(false);
    expect(nudgeDue(after(10, later), T0 + DAY)).toBe(true);
  });

  it('snoozes again after a second dismissal, from the new moment and count', () => {
    const again = dismissNudge(after(10, dismissed), T0 + 8 * DAY);
    expect(again).toEqual({ actions: 13, dismissedAt: T0 + 8 * DAY, actionsAtDismiss: 13 });
    expect(nudgeDue(again, T0 + 8 * DAY + 1)).toBe(false);
    expect(nudgeDue(again, T0 + 15 * DAY)).toBe(true);
  });

  it('ignores a clock that moved back (no negative time makes it due)', () => {
    expect(nudgeDue(dismissed, T0 - 30 * DAY)).toBe(false);
  });
});

describe('recordAdd and dismissNudge', () => {
  it('only ever goes up: nothing decreases the count', () => {
    expect(recordAdd({ actions: 4 })).toEqual({ actions: 5 });
    expect(recordAdd({ actions: 0, dismissedAt: 5, actionsAtDismiss: 0 })).toEqual({
      actions: 1,
      dismissedAt: 5,
      actionsAtDismiss: 0,
    });
  });

  it('does not change the state it was given', () => {
    const state = Object.freeze({ actions: 2 });
    recordAdd(state);
    dismissNudge(state, T0);
    expect(state).toEqual({ actions: 2 });
  });
});

describe('parseNudgeState', () => {
  it('starts empty when nothing was stored or the value is not an object', () => {
    for (const raw of [undefined, null, 5, 'x', [], true]) {
      expect(parseNudgeState(raw)).toEqual({ actions: 0 });
    }
  });

  it('keeps valid values', () => {
    expect(parseNudgeState({ actions: 4, dismissedAt: 10, actionsAtDismiss: 3 })).toEqual({
      actions: 4,
      dismissedAt: 10,
      actionsAtDismiss: 3,
    });
  });

  it('repairs bad numbers', () => {
    expect(parseNudgeState({ actions: -3 })).toEqual({ actions: 0 });
    expect(parseNudgeState({ actions: 2.7 })).toEqual({ actions: 2 });
    expect(parseNudgeState({ actions: Number.NaN })).toEqual({ actions: 0 });
    expect(parseNudgeState({ actions: '5' })).toEqual({ actions: 0 });
  });

  it('a dismissal with no count is read as made at the current count', () => {
    expect(parseNudgeState({ actions: 5, dismissedAt: 10 })).toEqual({
      actions: 5,
      dismissedAt: 10,
      actionsAtDismiss: 5,
    });
  });

  it('drops a count with no dismissal time, and a count above the total', () => {
    expect(parseNudgeState({ actions: 5, actionsAtDismiss: 2 })).toEqual({ actions: 5 });
    expect(parseNudgeState({ actions: 2, dismissedAt: 1, actionsAtDismiss: 9 })).toEqual({
      actions: 2,
      dismissedAt: 1,
      actionsAtDismiss: 2,
    });
  });
});

describe('nudgeVisible', () => {
  const ok = {
    due: true,
    ready: true,
    guest: true,
    playerOpen: false,
    toastVisible: false,
    welcomeOpen: false,
    pathname: '/book/dracula',
  };

  it('shows when due and nothing else is in the way', () => {
    expect(nudgeVisible(ok)).toBe(true);
  });

  it.each([
    ['not due', { due: false }],
    ['storage not read yet', { ready: false }],
    ['a signed-in listener', { guest: false }],
    ['the full-screen player is open', { playerOpen: true }],
    ['a toast (Undo) is showing', { toastVisible: true }],
    ['the welcome screen is open', { welcomeOpen: true }],
    ['on the sign-in page itself', { pathname: '/signin' }],
  ])('stays hidden when %s', (_name, change) => {
    expect(nudgeVisible({ ...ok, ...change })).toBe(false);
  });
});

describe('signinHref', () => {
  it('keeps the current page in ?next=', () => {
    expect(signinHref('/book/dracula', '')).toBe('/signin?next=%2Fbook%2Fdracula');
    expect(signinHref('/search', '?q=tolkien&tab=books')).toBe(
      '/signin?next=%2Fsearch%3Fq%3Dtolkien%26tab%3Dbooks',
    );
    expect(signinHref('/library', '?tab=liked')).toBe('/signin?next=%2Flibrary%3Ftab%3Dliked');
  });

  it('goes home from Home', () => {
    expect(signinHref('/', '')).toBe('/signin?next=%2F');
  });

  it('accepts a search string without the question mark', () => {
    expect(signinHref('/search', 'q=a')).toBe('/signin?next=%2Fsearch%3Fq%3Da');
  });

  it('never points back at the sign-in page', () => {
    expect(signinHref('/signin', '?next=%2Fx')).toBe('/signin');
  });

  it('refuses a path that is not a plain same-site path', () => {
    expect(signinHref('//evil.example', '')).toBe('/signin');
    expect(signinHref('https://evil.example', '')).toBe('/signin');
    expect(signinHref('', '')).toBe('/signin');
  });
});
