/**
 * The "Needs attention" flag of the admin books list (PRD: Book lifecycle). It is not a status:
 * it is computed from what a book has, so it disappears as soon as the problem is fixed.
 *
 * A draft is allowed to be incomplete, so only a failed track counts there. A published or
 * scheduled book must meet the publish rules (`publish/rules.ts`): author, category, narrator and
 * one ready track. There is no cover check: the app shows designed covers and cover upload is
 * parked (dropped from the rules in 4d, Sasha 23 Nov); add it back with the upload.
 */
export type BookStatus = 'draft' | 'scheduled' | 'published';

export type AttentionReason =
  | { kind: 'failed-track'; positions: number[] }
  | { kind: 'missing'; field: 'author' | 'category' | 'narrator' }
  | { kind: 'no-ready-track' };

export interface AttentionInput {
  status: BookStatus;
  hasAuthor: boolean;
  hasCategory: boolean;
  hasNarrator: boolean;
  readyTracks: number;
  /** Positions (from 1) of the tracks whose upload or processing failed. */
  failedTrackPositions: number[];
}

export function findAttention(book: AttentionInput): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (book.failedTrackPositions.length > 0) {
    reasons.push({ kind: 'failed-track', positions: book.failedTrackPositions });
  }
  if (book.status === 'draft') return reasons;

  if (!book.hasAuthor) reasons.push({ kind: 'missing', field: 'author' });
  if (!book.hasCategory) reasons.push({ kind: 'missing', field: 'category' });
  if (!book.hasNarrator) reasons.push({ kind: 'missing', field: 'narrator' });
  if (book.readyTracks === 0) reasons.push({ kind: 'no-ready-track' });
  return reasons;
}

const FIELD_LABEL = {
  author: 'Author',
  category: 'Category',
  narrator: 'Narrator',
} as const;

function describe(reason: AttentionReason): string {
  switch (reason.kind) {
    case 'failed-track':
      return reason.positions.length === 1
        ? `Track ${reason.positions[0]} failed`
        : `Tracks ${reason.positions.join(', ')} failed`;
    case 'missing':
      return `${FIELD_LABEL[reason.field]} missing`;
    case 'no-ready-track':
      return 'No ready track';
  }
}

/** One line for a list row: the first problem, and how many more there are. */
export function attentionNote(reasons: AttentionReason[]): string {
  const [first, ...rest] = reasons;
  if (!first) return '';
  return rest.length > 0 ? `${describe(first)} · +${rest.length} more` : describe(first);
}
