'use client';

import { useEffect } from 'react';
import {
  WELCOME_GATE_MAX_MS,
  WELCOME_RESOLVED_EVENT,
  readWelcomeGate,
} from '@/features/guest/gate';

/** Add ?splash=hold to any URL to keep the splash up and watch its 3 s and 15 s messages. */
export const SPLASH_HOLD_PARAM = 'splash';

/**
 * Marks the app as hydrated; the splash fades out in response (see splash.tsx).
 *
 * On the home page of a browser that may not have seen the welcome yet, the page script left
 * `data-welcome="pending"` on `<html>`. The splash then stays until the welcome decision is
 * made (a Dexie read, normally a few milliseconds), so a new listener goes from splash to
 * welcome without a glimpse of Home, and a repeat visit (no attribute) is not delayed at all.
 * The wait is capped, so a stuck read can never keep the splash up.
 */
export function AppReady() {
  useEffect(() => {
    const hold = new URLSearchParams(window.location.search).get(SPLASH_HOLD_PARAM) === 'hold';
    if (hold) return;

    const lift = () => {
      document.documentElement.dataset.appReady = '';
    };
    if (readWelcomeGate() !== 'pending') {
      lift();
      return;
    }

    const onResolved = () => {
      if (readWelcomeGate() !== 'pending') lift();
    };
    window.addEventListener(WELCOME_RESOLVED_EVENT, onResolved);
    const timer = window.setTimeout(lift, WELCOME_GATE_MAX_MS);
    return () => {
      window.removeEventListener(WELCOME_RESOLVED_EVENT, onResolved);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
