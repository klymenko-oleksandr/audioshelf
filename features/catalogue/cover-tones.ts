/**
 * The six cover palettes of the design (canvas: BookCard), shared by the on-screen cover
 * (`components/book-cover.tsx`, which maps them to theme colours) and the cover images made
 * on the server (`lib/cover-image`, which needs plain hex values and the light theme).
 */
export const COVER_TONES = ['ink', 'green', 'stone', 'mist', 'deep', 'lime'] as const;
export type CoverTone = (typeof COVER_TONES)[number];

/** Light-theme colours of each tone, as hex (the server-made images have no CSS variables). */
export const COVER_TONE_COLORS: Record<CoverTone, { background: string; color: string }> = {
  ink: { background: '#09090b', color: '#ffffff' },
  green: { background: '#008236', color: '#f0fdf4' },
  stone: { background: '#52525c', color: '#fafafa' },
  mist: { background: '#d4d4d8', color: '#27272a' },
  deep: { background: '#27272a', color: '#d4d4d8' },
  lime: { background: '#00a63e', color: '#27272a' },
};

/** Stable tone for a book, so its generated cover looks the same everywhere. */
export function toneFor(seed: string): CoverTone {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return COVER_TONES[hash % COVER_TONES.length]!;
}
