/** Number formatting for the player. Words ("min left", "h") come from the message files. */

/** "27:14", "1:02:03". Used for elapsed time and chapter positions. */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "−25:26" with a real minus sign, for time remaining. */
export function formatRemaining(seconds: number): string {
  return `−${formatClock(Math.ceil(Math.max(0, seconds)))}`;
}

/** Whole hours and minutes, for "10 h 24 m" and "25 min left" (rounded to the minute). */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const totalMinutes = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds / 60)) : 0;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** "1.25×", "1×", "0.5×". */
export function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`;
}
