'use client';

import { useEffect } from 'react';

/** Add ?splash=hold to any URL to keep the splash up and watch its 3 s and 15 s messages. */
export const SPLASH_HOLD_PARAM = 'splash';

/** Marks the app as hydrated; the splash fades out in response (see splash.tsx). */
export function AppReady() {
  useEffect(() => {
    const hold = new URLSearchParams(window.location.search).get(SPLASH_HOLD_PARAM) === 'hold';
    if (!hold) document.documentElement.dataset.appReady = '';
  }, []);

  return null;
}
