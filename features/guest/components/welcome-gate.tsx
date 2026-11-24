'use client';

import { useEffect, useRef, useState } from 'react';
import { readWelcomeGate, setWelcomeGate } from '../gate';
import { getGuestStore, useGuest } from '../use-guest';
import { shouldShowWelcome, welcomeSeen, writeWelcomeMirror } from '../welcome';
import { WelcomeScreen } from './welcome-screen';

/**
 * Decides whether this visit gets the welcome screen and shows it.
 *
 * The page script already ruled out the common cases before first paint: no `data-welcome`
 * attribute means a deep link or a repeat visit, and nothing happens here. Only when it says
 * `pending` (the home page, mirror not set) does this wait for Dexie, which is the source of
 * truth, and apply the rules in `welcome.ts`. It then hands the splash over: the welcome is
 * in the DOM before the splash lifts, or there is nothing to show and the splash lifts.
 *
 * Skipping, finishing or seeing it in another tab all end up as `welcomeSeen`, which closes it.
 */
export function WelcomeGate() {
  const guest = useGuest();
  /** The rules said "show it" for this visit. */
  const [due, setDue] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !guest.ready) return;
    decided.current = true;
    if (readWelcomeGate() !== 'pending') return;

    const show = shouldShowWelcome({
      landing: true, // the page script only sets `pending` on a plain home page
      seen: welcomeSeen({ browserSeen: guest.welcomeSeen }),
      hasActivity: guest.hasActivity,
    });
    if (show) {
      // Not a cascade: the one decision of this visit, taken once Dexie has been read.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDue(true);
      return;
    }
    // Already seen here (Dexie knows, the mirror did not) or an existing listener.
    writeWelcomeMirror();
    void getGuestStore().markWelcomeSeen();
    setWelcomeGate('done');
  }, [guest]);

  const open = due && !guest.welcomeSeen;

  useEffect(() => {
    // The dialog is in the DOM now: let the splash go.
    if (open) setWelcomeGate('open');
  }, [open]);

  useEffect(() => {
    // It was open and has now been seen: here, or in another tab.
    if (!due || !guest.welcomeSeen) return;
    writeWelcomeMirror();
    setWelcomeGate('done');
  }, [due, guest.welcomeSeen]);

  if (!open) return null;
  return <WelcomeScreen onDone={() => void getGuestStore().markWelcomeSeen()} />;
}
