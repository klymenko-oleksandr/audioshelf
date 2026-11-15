/**
 * The player state machine (PRD: Player → States).
 *
 *   Idle ──play──▶ Loading ──can play──▶ Playing ◀──play / pause──▶ Paused
 *                     │ failed              │ stalled      ▲ data
 *                     ▼                     ▼              │
 *                   Error ◀──timeout 15 s── Buffering ─────┘
 *                     │ retry               Playing ──end of book──▶ Finished
 *                     ▼
 *                  Loading
 *
 * The PRD diagram shows the main path. The rest of the table below fills in what a real
 * `<audio>` element and a real listener also do: pausing while loading or buffering, a media
 * error in the middle of playback, restoring the last book on app open without autoplay,
 * seeking back after the end, and starting another book at any time.
 *
 * This module is pure: it answers "which state comes next". The audio engine (Phase 2b)
 * performs the side effects when the state changes.
 */

export type PlayerStatus =
  'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'finished';

export type PlayerEvent =
  /** The listener starts a book (also "another book": it replaces the current one). */
  | 'START'
  /** App open: the last book is restored at its saved position, without autoplay. */
  | 'RESTORE'
  /** The listener presses Play. */
  | 'PLAY'
  /** The listener presses Pause (also: another tab took over, sleep timer ran out). */
  | 'PAUSE'
  /** The audio element can play from the requested position. */
  | 'CAN_PLAY'
  /** Playback stopped because data ran out. */
  | 'STALLED'
  /** Data arrived and playback continues. */
  | 'DATA'
  /** Loading or buffering took longer than 15 s. */
  | 'TIMEOUT'
  /** The audio element reported an error. */
  | 'FAILED'
  /** The listener presses "Try again". */
  | 'RETRY'
  /** The last track played to its end. */
  | 'ENDED'
  /** The listener seeks (matters only after the end: it brings the book back). */
  | 'SEEK'
  /** The book is unloaded (e.g. it was deleted). */
  | 'CLOSE';

export const PLAYER_STATUSES = [
  'idle',
  'loading',
  'playing',
  'paused',
  'buffering',
  'error',
  'finished',
] as const satisfies readonly PlayerStatus[];

export const PLAYER_EVENTS = [
  'START',
  'RESTORE',
  'PLAY',
  'PAUSE',
  'CAN_PLAY',
  'STALLED',
  'DATA',
  'TIMEOUT',
  'FAILED',
  'RETRY',
  'ENDED',
  'SEEK',
  'CLOSE',
] as const satisfies readonly PlayerEvent[];

/** Loading and buffering give up after this long (PRD: "Buffering → Error: timeout 15 s"). */
export const STALL_TIMEOUT_MS = 15_000;

type Transitions = Partial<Record<PlayerEvent, PlayerStatus>>;

/** Every transition that changes something. Anything not listed is ignored. */
const TABLE: Record<PlayerStatus, Transitions> = {
  idle: {
    START: 'loading',
    RESTORE: 'paused',
  },
  loading: {
    START: 'loading',
    CAN_PLAY: 'playing',
    PAUSE: 'paused',
    FAILED: 'error',
    TIMEOUT: 'error',
    CLOSE: 'idle',
  },
  playing: {
    START: 'loading',
    PAUSE: 'paused',
    STALLED: 'buffering',
    FAILED: 'error',
    ENDED: 'finished',
    CLOSE: 'idle',
  },
  paused: {
    START: 'loading',
    PLAY: 'playing',
    FAILED: 'error',
    CLOSE: 'idle',
  },
  buffering: {
    START: 'loading',
    DATA: 'playing',
    CAN_PLAY: 'playing',
    PAUSE: 'paused',
    TIMEOUT: 'error',
    FAILED: 'error',
    ENDED: 'finished',
    CLOSE: 'idle',
  },
  error: {
    START: 'loading',
    RETRY: 'loading',
    PLAY: 'loading',
    CLOSE: 'idle',
  },
  finished: {
    START: 'loading',
    // Play on a finished book starts it from the beginning.
    PLAY: 'loading',
    SEEK: 'paused',
    CLOSE: 'idle',
  },
};

/** The next status, or the same one when the event does not apply. */
export function transition(status: PlayerStatus, event: PlayerEvent): PlayerStatus {
  return TABLE[status][event] ?? status;
}

export function canHandle(status: PlayerStatus, event: PlayerEvent): boolean {
  return TABLE[status][event] !== undefined;
}

/** A book is loaded (there is something to show in the player bar). */
export function hasBook(status: PlayerStatus): boolean {
  return status !== 'idle';
}

/** The listener expects sound right now or as soon as data arrives. */
export function wantsToPlay(status: PlayerStatus): boolean {
  return status === 'loading' || status === 'playing' || status === 'buffering';
}

/** Show a spinner in the play button (subject to the 300 / 600 ms loader timing). */
export function isWaiting(status: PlayerStatus): boolean {
  return status === 'loading' || status === 'buffering';
}

/** The stall timer runs in these states and raises TIMEOUT after STALL_TIMEOUT_MS. */
export function hasStallTimeout(status: PlayerStatus): boolean {
  return isWaiting(status);
}

/** Position is saved every 5 s only while audio is actually advancing. */
export function isAdvancing(status: PlayerStatus): boolean {
  return status === 'playing';
}
