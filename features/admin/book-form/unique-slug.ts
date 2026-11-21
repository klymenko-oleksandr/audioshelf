import { slugify } from '@/lib/slug';

/**
 * Slugs for books, authors and narrators come from the name with `lib/slug.ts` and must stay
 * unique (a unique index backs every one of them). A taken slug gets `-2`, `-3`, … so two books
 * with the same title never fight over a URL.
 */

/** Leaves room for a "-NN" suffix under the 60-character slug limit of `lib/slug.ts`. */
const BASE_MAX = 56;

export function slugBase(text: string, fallback: string): string {
  return slugify(text, BASE_MAX) || fallback;
}

export function pickUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Inserts a row under a free slug. `tryInsert` must do nothing and return `undefined` when the
 * slug is taken (`insert … on conflict do nothing returning …`), which happens when another
 * save took it after we looked; the taken slugs are then read again and the next one is tried.
 */
export async function insertWithUniqueSlug<T>(
  base: string,
  loadTaken: (base: string) => Promise<ReadonlySet<string>>,
  tryInsert: (slug: string) => Promise<T | undefined>,
  maxAttempts = 5,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = pickUniqueSlug(base, await loadTaken(base));
    const row = await tryInsert(slug);
    if (row !== undefined) return row;
  }
  throw new Error(`Could not find a unique slug for "${base}" after ${maxAttempts} attempts.`);
}
