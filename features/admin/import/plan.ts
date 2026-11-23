/**
 * What an import does with each part of `book.json`, given what the book already holds
 * (Phase 4e). Pure: no database, no storage.
 *
 * The rule for ongoing books (same as 4c-2): importing again only **appends** new parts. A part
 * that is already ready is never written, whatever the file says; a part the admin removed stays
 * removed; new parts go after the highest position. Only a part that never became ready (an
 * interrupted import) is started again, because nothing a listener can see depends on it.
 */
import { checkAppendOnly, type BookStatus } from '../tracks/append-only';
import type { ImportPart } from './book-json';

/** More new parts than this wait for the next request, so one call never runs for minutes. */
export const MAX_NEW_PARTS = 25;

export interface ExistingTrack {
  id: string;
  position: number;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  r2Key: string;
}

export type PlanAction =
  /** Already ready and the same file: nothing to do. */
  | { number: number; kind: 'skip' }
  /** Already ready but the file in `book.json` differs: left as it is, reported. */
  | { number: number; kind: 'changed' }
  /** A gap below the highest position: the admin removed it, so it stays removed. */
  | { number: number; kind: 'removed' }
  /** Never became ready: upload it again. `failFirst` when the row still says `uploading`. */
  | { number: number; kind: 'resume'; trackId: string; failFirst: boolean }
  /** Not in the book yet: append it. */
  | { number: number; kind: 'new' }
  /** Resuming would put a part before one that is already ready on a published book. */
  | { number: number; kind: 'blocked'; trackId: string }
  /** Someone is finishing this part right now. */
  | { number: number; kind: 'busy'; trackId: string };

export interface ImportPlan {
  actions: PlanAction[];
  /** Part numbers left for a later request (too many new parts, or stopped by a blocked part). */
  deferred: number[];
  warnings: string[];
}

/** The 8 hex characters before the extension in a key built by `trackKey`, if there are any. */
export function hashFromKey(key: string): string | undefined {
  return /-([a-f0-9]{8})\.(?:mp3|m4a)$/.exec(key)?.[1];
}

export function planImport(input: {
  bookStatus: BookStatus;
  parts: ImportPart[];
  existing: ExistingTrack[];
}): ImportPlan {
  const byPosition = new Map(input.existing.map((t) => [t.position, t]));
  const highest = input.existing.reduce((top, t) => Math.max(top, t.position), 0);
  const actions: PlanAction[] = [];
  const deferred: number[] = [];
  const warnings: string[] = [];
  let planned = 0;
  let stopped = false;

  for (const part of [...input.parts].sort((a, b) => a.number - b.number)) {
    const there = byPosition.get(part.number);

    if (there?.status === 'ready') {
      const stored = hashFromKey(there.r2Key);
      if (stored !== undefined && stored !== part.sha256.slice(0, 8)) {
        actions.push({ number: part.number, kind: 'changed' });
        warnings.push(
          `Part ${part.number} is already in the book with a different file. It was left as it is.`,
        );
      } else actions.push({ number: part.number, kind: 'skip' });
      continue;
    }

    if (!there && part.number <= highest) {
      actions.push({ number: part.number, kind: 'removed' });
      continue;
    }

    // From here the part needs work; after a problem nothing later is started.
    if (stopped || planned >= MAX_NEW_PARTS) {
      deferred.push(part.number);
      continue;
    }

    if (!there) {
      actions.push({ number: part.number, kind: 'new' });
      planned++;
      continue;
    }

    if (there.status === 'processing') {
      actions.push({ number: part.number, kind: 'busy', trackId: there.id });
      warnings.push(`Part ${part.number} is being processed right now. Try again in a minute.`);
      stopped = true;
      continue;
    }

    const placement = checkAppendOnly(input.bookStatus, input.existing, there.id);
    if (!placement.ok) {
      actions.push({ number: part.number, kind: 'blocked', trackId: there.id });
      warnings.push(`Part ${part.number} cannot be uploaded again: ${placement.message}`);
      stopped = true;
      continue;
    }
    actions.push({
      number: part.number,
      kind: 'resume',
      trackId: there.id,
      failFirst: there.status === 'uploading',
    });
    planned++;
  }

  return { actions, deferred, warnings };
}
