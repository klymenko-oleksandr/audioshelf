/**
 * The "Needs attention" flag of the admin books list (PRD: Book lifecycle). It is not a status:
 * it is computed from what a book has, so it disappears as soon as the problem is fixed.
 *
 * A draft is allowed to be incomplete, so only a failed track counts there. A published or
 * scheduled book must meet the publish rules: author, category, cover and one ready track.
 * (The narrator is optional in the PRD, so it is not checked.)
 */
export type BookStatus = 'draft' | 'scheduled' | 'published';

export type AttentionReason =
  | { kind: 'failed-track'; positions: number[] }
  | { kind: 'missing'; field: 'author' | 'category' | 'cover' }
  | { kind: 'no-ready-track' };

export interface AttentionInput {
  status: BookStatus;
  hasAuthor: boolean;
  hasCategory: boolean;
  hasCover: boolean;
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
  if (!book.hasCover) reasons.push({ kind: 'missing', field: 'cover' });
  if (book.readyTracks === 0) reasons.push({ kind: 'no-ready-track' });
  return reasons;
}

const FIELD_LABEL = { author: 'Author', category: 'Category', cover: 'Cover' } as const;

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
