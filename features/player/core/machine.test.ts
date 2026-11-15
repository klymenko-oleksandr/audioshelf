import { describe, expect, it } from 'vitest';
import {
  canHandle,
  hasBook,
  hasStallTimeout,
  isAdvancing,
  isWaiting,
  PLAYER_EVENTS,
  PLAYER_STATUSES,
  transition,
  wantsToPlay,
  type PlayerEvent,
  type PlayerStatus,
} from './machine';

/**
 * The whole machine, written out independently of the implementation: for every state,
 * what each of the 13 events does. "·" means the event is ignored (state unchanged).
 */
const S = {
  i: 'idle',
  l: 'loading',
  p: 'playing',
  pa: 'paused',
  b: 'buffering',
  e: 'error',
  f: 'finished',
} as const;
type Cell = PlayerStatus | '·';
// prettier-ignore
const EXPECTED: Record<PlayerStatus, Record<PlayerEvent, Cell>> = {
  //           START       RESTORE        PLAY        PAUSE        CAN_PLAY      STALLED       DATA        TIMEOUT       FAILED       RETRY        ENDED        SEEK         CLOSE
  idle:      { START: S.l, RESTORE: S.pa, PLAY: '·',  PAUSE: '·',  CAN_PLAY: '·', STALLED: '·', DATA: '·',  TIMEOUT: '·', FAILED: '·', RETRY: '·',  ENDED: '·',  SEEK: '·',   CLOSE: '·' },
  loading:   { START: S.l, RESTORE: '·',  PLAY: '·',  PAUSE: S.pa, CAN_PLAY: S.p, STALLED: '·', DATA: '·',  TIMEOUT: S.e, FAILED: S.e, RETRY: '·',  ENDED: '·',  SEEK: '·',   CLOSE: S.i },
  playing:   { START: S.l, RESTORE: '·',  PLAY: '·',  PAUSE: S.pa, CAN_PLAY: '·', STALLED: S.b, DATA: '·',  TIMEOUT: '·', FAILED: S.e, RETRY: '·',  ENDED: S.f,  SEEK: '·',   CLOSE: S.i },
  paused:    { START: S.l, RESTORE: '·',  PLAY: S.p,  PAUSE: '·',  CAN_PLAY: '·', STALLED: '·', DATA: '·',  TIMEOUT: '·', FAILED: S.e, RETRY: '·',  ENDED: '·',  SEEK: '·',   CLOSE: S.i },
  buffering: { START: S.l, RESTORE: '·',  PLAY: '·',  PAUSE: S.pa, CAN_PLAY: S.p, STALLED: '·', DATA: S.p,  TIMEOUT: S.e, FAILED: S.e, RETRY: '·',  ENDED: S.f,  SEEK: '·',   CLOSE: S.i },
  error:     { START: S.l, RESTORE: '·',  PLAY: S.l,  PAUSE: '·',  CAN_PLAY: '·', STALLED: '·', DATA: '·',  TIMEOUT: '·', FAILED: '·', RETRY: S.l,  ENDED: '·',  SEEK: '·',   CLOSE: S.i },
  finished:  { START: S.l, RESTORE: '·',  PLAY: S.l,  PAUSE: '·',  CAN_PLAY: '·', STALLED: '·', DATA: '·',  TIMEOUT: '·', FAILED: '·', RETRY: '·',  ENDED: '·',  SEEK: S.pa,  CLOSE: S.i },
};

describe('player state machine — every state × every event', () => {
  const cases = PLAYER_STATUSES.flatMap((status) =>
    PLAYER_EVENTS.map((event) => ({ status, event, expected: EXPECTED[status][event] })),
  );

  it('covers all 7 × 13 combinations', () => {
    expect(cases).toHaveLength(91);
  });

  it.each(cases)('$status + $event → $expected', ({ status, event, expected }) => {
    const next = transition(status, event);
    if (expected === '·') {
      expect(next).toBe(status);
      expect(canHandle(status, event)).toBe(false);
    } else {
      expect(next).toBe(expected);
      expect(canHandle(status, event)).toBe(true);
    }
  });
});

describe('player state machine — paths', () => {
  const run = (...events: PlayerEvent[]) =>
    events.reduce<PlayerStatus>((status, event) => transition(status, event), 'idle');

  it('follows the PRD diagram: play, pause, resume, stall, recover, finish', () => {
    expect(run('START')).toBe('loading');
    expect(run('START', 'CAN_PLAY')).toBe('playing');
    expect(run('START', 'CAN_PLAY', 'PAUSE')).toBe('paused');
    expect(run('START', 'CAN_PLAY', 'PAUSE', 'PLAY')).toBe('playing');
    expect(run('START', 'CAN_PLAY', 'STALLED')).toBe('buffering');
    expect(run('START', 'CAN_PLAY', 'STALLED', 'DATA')).toBe('playing');
    expect(run('START', 'CAN_PLAY', 'ENDED')).toBe('finished');
  });

  it('fails after a 15 s stall or a load error, and retries into loading', () => {
    expect(run('START', 'CAN_PLAY', 'STALLED', 'TIMEOUT')).toBe('error');
    expect(run('START', 'FAILED')).toBe('error');
    expect(run('START', 'FAILED', 'RETRY')).toBe('loading');
    expect(run('START', 'FAILED', 'RETRY', 'CAN_PLAY')).toBe('playing');
  });

  it('restores the last book paused, then plays on demand', () => {
    expect(run('RESTORE')).toBe('paused');
    expect(run('RESTORE', 'PLAY')).toBe('playing');
    // The first data has to arrive: the element reports a stall, then continues.
    expect(run('RESTORE', 'PLAY', 'STALLED', 'DATA')).toBe('playing');
    // …or the network is down.
    expect(run('RESTORE', 'PLAY', 'STALLED', 'TIMEOUT')).toBe('error');
  });

  it('does not start playing when the listener paused while it was loading', () => {
    expect(run('START', 'PAUSE', 'CAN_PLAY')).toBe('paused');
  });

  it('plays a finished book again from loading, and seeking back un-finishes it', () => {
    expect(run('START', 'CAN_PLAY', 'ENDED', 'PLAY')).toBe('loading');
    expect(run('START', 'CAN_PLAY', 'ENDED', 'SEEK')).toBe('paused');
  });

  it('starting another book replaces the current one from any state', () => {
    for (const status of PLAYER_STATUSES) {
      expect(transition(status, 'START')).toBe('loading');
    }
  });

  it('has no dead ends: every state can reach playing and can be closed', () => {
    const reachable = (from: PlayerStatus) => {
      const seen = new Set<PlayerStatus>([from]);
      const queue = [from];
      while (queue.length > 0) {
        const status = queue.shift()!;
        for (const event of PLAYER_EVENTS) {
          const next = transition(status, event);
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      return seen;
    };
    for (const status of PLAYER_STATUSES) {
      expect(reachable(status), `from ${status}`).toContain('playing');
      expect(reachable(status), `from ${status}`).toContain('idle');
    }
  });
});

describe('player state machine — derived flags', () => {
  const flags = (status: PlayerStatus) => ({
    hasBook: hasBook(status),
    wantsToPlay: wantsToPlay(status),
    isWaiting: isWaiting(status),
    hasStallTimeout: hasStallTimeout(status),
    isAdvancing: isAdvancing(status),
  });

  it.each([
    [
      'idle',
      {
        hasBook: false,
        wantsToPlay: false,
        isWaiting: false,
        hasStallTimeout: false,
        isAdvancing: false,
      },
    ],
    [
      'loading',
      {
        hasBook: true,
        wantsToPlay: true,
        isWaiting: true,
        hasStallTimeout: true,
        isAdvancing: false,
      },
    ],
    [
      'playing',
      {
        hasBook: true,
        wantsToPlay: true,
        isWaiting: false,
        hasStallTimeout: false,
        isAdvancing: true,
      },
    ],
    [
      'paused',
      {
        hasBook: true,
        wantsToPlay: false,
        isWaiting: false,
        hasStallTimeout: false,
        isAdvancing: false,
      },
    ],
    [
      'buffering',
      {
        hasBook: true,
        wantsToPlay: true,
        isWaiting: true,
        hasStallTimeout: true,
        isAdvancing: false,
      },
    ],
    [
      'error',
      {
        hasBook: true,
        wantsToPlay: false,
        isWaiting: false,
        hasStallTimeout: false,
        isAdvancing: false,
      },
    ],
    [
      'finished',
      {
        hasBook: true,
        wantsToPlay: false,
        isWaiting: false,
        hasStallTimeout: false,
        isAdvancing: false,
      },
    ],
  ] as const)('%s', (status, expected) => {
    expect(flags(status)).toEqual(expected);
  });
});
