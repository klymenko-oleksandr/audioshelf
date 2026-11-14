'use client';

import { useEffect, useRef, useState } from 'react';

export const LOADER_DELAY_MS = 300;
export const LOADER_MINIMUM_MS = 600;

interface Options {
  /** Wait this long before showing anything; faster loads show no loader at all. */
  delay?: number;
  /** Once shown, keep the loader at least this long so it never blinks. */
  minimum?: number;
}

/**
 * In-app loader timing from the PRD (skeletons, button spinners, player buffering):
 * nothing for the first 300 ms, then at least 600 ms on screen.
 * Example: data arrives at 400 ms → the loader shows from 300 to 900 ms.
 *
 * Returns whether the loader should be visible right now. While it returns `false`
 * and `loading` is still true, keep rendering the previous view.
 */
export function useDelayedLoading(loading: boolean, options: Options = {}): boolean {
  const { delay = LOADER_DELAY_MS, minimum = LOADER_MINIMUM_MS } = options;
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      if (shownAt.current !== null) return; // already visible: stay
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }

    if (shownAt.current === null) return; // never appeared: nothing to hide
    const remaining = Math.max(0, minimum - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading, delay, minimum]);

  return visible;
}
