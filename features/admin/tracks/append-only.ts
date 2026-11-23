/**
 * Rules for changing the parts of a book that listeners may already be playing (PRD: add parts
 * to a published book). New parts only go on the end; nothing already there moves.
 */

export type BookStatus = 'draft' | 'scheduled' | 'published';

/** Reordering rebuilds the chapters, so it is only for drafts. */
export const canReorder = (status: BookStatus) => status === 'draft';

const END_OF_PUBLISHED =
  'Parts can only be added at the end of a published book, and this one would come before a part that is already there. Remove this part and add the file again.';

export type PlacementCheck = { ok: true } | { ok: false; message: string };

/**
 * May this part become ready where it is? On a draft anywhere. On a published or scheduled book
 * only when no ready part comes after it, because its chapter would push theirs later and
 * listeners' saved positions would point at the wrong place.
 */
export function checkAppendOnly(
  status: BookStatus,
  tracks: { id: string; position: number; status: string }[],
  trackId: string,
): PlacementCheck {
  if (status === 'draft') return { ok: true };
  const target = tracks.find((t) => t.id === trackId);
  if (!target) return { ok: true };
  const blocked = tracks.some(
    (t) => t.id !== trackId && t.status === 'ready' && t.position > target.position,
  );
  return blocked ? { ok: false, message: END_OF_PUBLISHED } : { ok: true };
}
