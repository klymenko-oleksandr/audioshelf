// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  WELCOME_INIT_SCRIPT,
  WELCOME_MIRROR_KEY,
  isWelcomeLanding,
  shouldShowWelcome,
  welcomeSeen,
} from './welcome';

describe('isWelcomeLanding', () => {
  it('is only the home page itself', () => {
    expect(isWelcomeLanding('/', '')).toBe(true);
  });

  it('is never a deep link', () => {
    for (const path of [
      '/book/dracula',
      '/search',
      '/library',
      '/settings',
      '/explore',
      '/signin',
    ]) {
      expect(isWelcomeLanding(path, '')).toBe(false);
    }
  });

  it('is not Home with the full-screen player open (#player)', () => {
    expect(isWelcomeLanding('/', '#player')).toBe(false);
  });
});

describe('welcomeSeen: one place for the rule (Phase 6 adds the account case)', () => {
  it('a guest has seen it when this browser has', () => {
    expect(welcomeSeen({ browserSeen: false })).toBe(false);
    expect(welcomeSeen({ browserSeen: true })).toBe(true);
  });

  it('a signed-in listener follows the account, not the browser', () => {
    expect(welcomeSeen({ browserSeen: false, account: { seen: true } })).toBe(true);
    expect(welcomeSeen({ browserSeen: true, account: { seen: false } })).toBe(false);
  });
});

describe('shouldShowWelcome', () => {
  const first = { landing: true, seen: false, hasActivity: false };

  it('shows on the first visit to Home', () => {
    expect(shouldShowWelcome(first)).toBe(true);
  });

  it('does not show once seen (skipped or finished)', () => {
    expect(shouldShowWelcome({ ...first, seen: true })).toBe(false);
  });

  it('never shows on a deep link, and the deep link does not count as seen', () => {
    expect(shouldShowWelcome({ ...first, landing: false })).toBe(false);
  });

  it('does not welcome someone who already has listening data in this browser', () => {
    expect(shouldShowWelcome({ ...first, hasActivity: true })).toBe(false);
  });
});

/** Runs the head script against a fake page and reports the attribute it set. */
function runInit(options: {
  pathname: string;
  hash?: string;
  stored?: string | null;
  storageThrows?: boolean;
}): string | null {
  let attribute: string | null = null;
  const context = {
    location: { pathname: options.pathname, hash: options.hash ?? '' },
    localStorage: {
      getItem(key: string) {
        if (options.storageThrows) throw new Error('blocked');
        return key === WELCOME_MIRROR_KEY ? (options.stored ?? null) : null;
      },
    },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          if (name === 'data-welcome') attribute = value;
        },
      },
    },
  };
  runInNewContext(WELCOME_INIT_SCRIPT, context);
  return attribute;
}

describe('WELCOME_INIT_SCRIPT (runs in <head>, before the first paint)', () => {
  it('marks Home as pending when this browser has not seen the welcome', () => {
    expect(runInit({ pathname: '/' })).toBe('pending');
  });

  it('marks nothing once the mirror says seen, so there is no flash on repeat visits', () => {
    expect(runInit({ pathname: '/', stored: '1' })).toBeNull();
  });

  it('marks nothing on a deep link or with #player', () => {
    expect(runInit({ pathname: '/book/dracula' })).toBeNull();
    expect(runInit({ pathname: '/library' })).toBeNull();
    expect(runInit({ pathname: '/', hash: '#player' })).toBeNull();
  });

  it('is pending when storage is blocked (Dexie decides) and never throws', () => {
    expect(runInit({ pathname: '/', storageThrows: true })).toBe('pending');
  });

  it('ignores any other stored value', () => {
    expect(runInit({ pathname: '/', stored: 'yes' })).toBe('pending');
  });
});

describe('writeWelcomeMirror', () => {
  it('writes the seen marker the head script looks for', async () => {
    const { writeWelcomeMirror } = await import('./welcome');
    const setItem = vi.fn();
    writeWelcomeMirror({ setItem });
    expect(setItem).toHaveBeenCalledWith(WELCOME_MIRROR_KEY, '1');
  });

  it('does not throw when storage is blocked', async () => {
    const { writeWelcomeMirror } = await import('./welcome');
    expect(() =>
      writeWelcomeMirror({
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
