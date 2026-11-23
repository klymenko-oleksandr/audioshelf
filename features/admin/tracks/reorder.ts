import { trackStartSeconds } from './chapters';

/**
 * Reordering the parts of a draft (PRD: drag to reorder; built as move up / down). Chapters are
 * ranges of book time with no link to a part, so after a reorder they are rebuilt: one chapter
 * per ready part, laid end to end in the new order. A chapter keeps its own title when it still
 * maps to the same part.
 */

export interface ReorderTrack {
  id: string;
  position: number;
  status: string;
  durationSeconds: number;
  title: string;
}

export interface ReorderChapter {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
}

export interface RebuiltChapter {
  title: string;
  startSeconds: number;
  endSeconds: number;
}

export type ReorderPlan =
  | {
      ok: true;
      /** False when the order is the one the book already has: nothing needs writing. */
      changed: boolean;
      positions: { id: string; position: number }[];
      chapters: RebuiltChapter[];
      durationSeconds: number;
    }
  | { ok: false; reason: 'mismatch' };

/** Chapter ranges come from the same durations but through the database: allow rounding noise. */
const EPSILON = 0.001;

/**
 * The title a part's chapter had before the move: the one chapter lying inside the part's old
 * stretch of time. With none, or with several (the part was split), there is nothing safe to
 * keep, so the part's own title is used.
 */
function titleBefore(
  part: { start: number; end: number; title: string },
  chapters: ReorderChapter[],
): string {
  const inside = chapters.filter(
    (c) => c.startSeconds >= part.start - EPSILON && c.endSeconds <= part.end + EPSILON,
  );
  return inside.length === 1 ? inside[0]!.title : part.title;
}

export function planReorder(
  tracks: ReorderTrack[],
  chapters: ReorderChapter[],
  orderedIds: string[],
): ReorderPlan {
  const ids = new Set(tracks.map((t) => t.id));
  if (
    orderedIds.length !== tracks.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !ids.has(id))
  ) {
    return { ok: false, reason: 'mismatch' };
  }

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const currentOrder = [...tracks].sort((a, b) => a.position - b.position).map((t) => t.id);
  const changed = currentOrder.some((id, index) => id !== orderedIds[index]);

  const old = tracks.map((t) => ({ ...t }));
  const rebuilt: RebuiltChapter[] = [];
  let cursor = 0;
  for (const id of orderedIds) {
    const track = byId.get(id)!;
    if (track.status !== 'ready') continue;
    const start = trackStartSeconds(old, id);
    rebuilt.push({
      title: titleBefore(
        { start, end: start + track.durationSeconds, title: track.title },
        chapters,
      ),
      startSeconds: cursor,
      endSeconds: cursor + track.durationSeconds,
    });
    cursor += track.durationSeconds;
  }

  return {
    ok: true,
    changed,
    positions: orderedIds.map((id, index) => ({ id, position: index + 1 })),
    chapters: rebuilt,
    durationSeconds: cursor,
  };
}
