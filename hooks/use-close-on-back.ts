'use client';

import { useEffect, useRef } from 'react';

const STATE_KEY = '__overlay';
let nextId = 1;

/**
 * Makes the browser Back button close an open overlay instead of leaving the page
 * (PRD: phone bottom sheets close on back).
 *
 * Opening adds a history entry for the same URL; Back pops it and calls `onClose`.
 * Closing any other way (tap outside, Esc, an action) removes that entry again, so history
 * never accumulates. Next.js keeps its own router state in `history.state`, so it is copied.
 *
 * To navigate away from inside an open overlay use `router.replace(href)`: it swaps the
 * overlay's entry for the destination and leaves a clean history.
 */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const id = useRef(0);
  const pendingBack = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    if (pendingBack.current !== null) {
      // Effect re-run (React StrictMode): our entry is still on the stack — keep it.
      clearTimeout(pendingBack.current);
      pendingBack.current = null;
    } else {
      id.current = nextId++;
      window.history.pushState({ ...window.history.state, [STATE_KEY]: id.current }, '');
    }

    let closedByBack = false;
    const onPopState = () => {
      closedByBack = true;
      close.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      if (closedByBack) return;
      // Deferred so a StrictMode re-run can cancel it; skipped if we already navigated away.
      pendingBack.current = setTimeout(() => {
        pendingBack.current = null;
        if (window.history.state?.[STATE_KEY] === id.current) window.history.back();
      }, 0);
    };
  }, [open]);
}
