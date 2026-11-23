/**
 * Publish rules (PRD: Book lifecycle). A book can go live only when it has everything listeners
 * see: a title, an author, a category, a narrator ("Read by") and at least one ready track.
 *
 * The cover is deliberately not on the list: the app shows designed covers and cover upload is
 * parked, so a new book could never get one. When covers come back, add `'cover'` here and to
 * `describeMissing`; the server and the button both read this list.
 */
export type BookStatus = 'draft' | 'scheduled' | 'published';

export type Requirement = 'title' | 'author' | 'category' | 'narrator' | 'ready-track';

export interface PublishCandidate {
  title: string;
  hasAuthor: boolean;
  hasCategory: boolean;
  hasNarrator: boolean;
  readyTracks: number;
}

/** What is still missing, in the order the form asks for it. Empty means the book can go live. */
export function findMissing(book: PublishCandidate): Requirement[] {
  const missing: Requirement[] = [];
  if (book.title.trim() === '') missing.push('title');
  if (!book.hasAuthor) missing.push('author');
  if (!book.hasCategory) missing.push('category');
  if (!book.hasNarrator) missing.push('narrator');
  if (book.readyTracks === 0) missing.push('ready-track');
  return missing;
}

const LABEL: Record<Requirement, string> = {
  title: 'title',
  author: 'author',
  category: 'category',
  narrator: 'narrator',
  'ready-track': 'a ready audio track',
};

/** One line for next to the Publish button. */
export function describeMissing(missing: Requirement[]): string {
  return missing.length === 0 ? '' : `Missing: ${missing.map((m) => LABEL[m]).join(', ')}`;
}

/** Publish now: from a draft, or from a scheduled book (scheduling itself is v1.1). */
export const canPublishFrom = (status: BookStatus) => status === 'draft' || status === 'scheduled';

/** Back to draft: unpublish a live book or cancel a scheduled one. */
export const canUnpublishFrom = (status: BookStatus) =>
  status === 'published' || status === 'scheduled';
