'use client';

import { useEffect, useRef, useState } from 'react';
import { getAccountStore, useAccount } from '@/features/account/use-account';
import { readWelcomeGate, setWelcomeGate } from '../gate';
import { getGuestStore, useGuest } from '../use-guest';
import { shouldShowWelcome, WELCOME_MIRROR_KEY, welcomeSeen, writeWelcomeMirror } from '../welcome';
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
  const account = useAccount();
  /** The rules said "show it" for this visit. */
  const [due, setDue] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    // Who is listening decides the rule (once per browser for a guest, once per account for a
    // signed-in listener), so wait until both are known.
    if (decided.current || !guest.ready || account.status === 'loading') return;
    decided.current = true;
    if (readWelcomeGate() !== 'pending') return;

    const show = shouldShowWelcome({
      landing: true, // the page script only sets `pending` on a plain home page
      seen: welcomeSeen({
        browserSeen: guest.welcomeSeen,
        account: account.account ? { seen: account.account.welcomeSeen } : null,
      }),
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
    void getAccountStore().markWelcomeSeen();
    setWelcomeGate('done');
  }, [guest, account]);

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

  // A listener who saw it as a guest and then signed in: the account is told too, so a new
  // device on this account does not welcome them a second time.
  useEffect(() => {
    if (open || !guest.ready || account.status !== 'signedIn' || account.account.welcomeSeen)
      return;
    let mirrored = false;
    try {
      mirrored = window.localStorage.getItem(WELCOME_MIRROR_KEY) === '1';
    } catch {
      // Storage blocked: the Dexie flag below still counts.
    }
    if (guest.welcomeSeen || mirrored) void getAccountStore().markWelcomeSeen();
  }, [open, guest.ready, guest.welcomeSeen, account]);

  if (!open) return null;
  return (
    <WelcomeScreen
      onDone={() => {
        void getGuestStore().markWelcomeSeen();
        void getAccountStore().markWelcomeSeen();
      }}
    />
  );
}
