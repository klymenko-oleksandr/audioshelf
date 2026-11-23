'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The number of ready audio tracks of the book being edited. The tracks card owns the list and
 * the book form owns the Publish button; this is how the button learns that a part just became
 * ready (or was removed) without the page reloading.
 */
const Context = createContext<{ readyTracks: number; setReadyTracks: (n: number) => void } | null>(
  null,
);

export function BookReadinessProvider({
  initialReadyTracks,
  children,
}: {
  initialReadyTracks: number;
  children: ReactNode;
}) {
  const [readyTracks, setReadyTracks] = useState(initialReadyTracks);
  return <Context value={{ readyTracks, setReadyTracks }}>{children}</Context>;
}

/** Ready tracks of the current book; 0 where there is no provider (the add page). */
export function useReadyTracks(): number {
  return useContext(Context)?.readyTracks ?? 0;
}

/** Called by the tracks card whenever its count of ready parts changes. */
export function useReportReadyTracks(count: number): void {
  const context = useContext(Context);
  const setReadyTracks = context?.setReadyTracks;
  useEffect(() => setReadyTracks?.(count), [count, setReadyTracks]);
}
