'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ScrubberProps {
  /** 0–1 */
  value: number;
  /** Accessible name, e.g. "Position in book". */
  label: string;
  /** Read out instead of a bare percentage, e.g. "27:14 of 5:38:11". */
  valueText: string;
  /** Called once when the listener lets go (or presses a key), with 0–1. */
  onSeek: (fraction: number) => void;
  className?: string;
}

const STEPS = 1000;

/**
 * The progress track as a real slider: a native range input, so keyboard, touch and screen
 * readers work as people expect. While dragging it shows the drag position and seeks once on
 * release — seeking on every pixel would fire a burst of range requests.
 */
export function Scrubber({ value, label, valueText, onSeek, className }: ScrubberProps) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;

  const commit = () => {
    if (drag === null) return;
    onSeek(drag);
    setDrag(null);
  };

  return (
    <input
      type="range"
      min={0}
      max={STEPS}
      step={1}
      value={Math.round(shown * STEPS)}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(event) => setDrag(Number(event.target.value) / STEPS)}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      style={{ '--scrub': `${shown * 100}%` } as React.CSSProperties}
      className={cn('scrubber', className)}
    />
  );
}
