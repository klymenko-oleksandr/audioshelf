import { NEW_CHOICE } from '../book-form/values';
import type { PublishCandidate } from './rules';

type Raw = Record<string, string | undefined>;

const chosen = (choice: string | undefined, newName: string | undefined) =>
  choice === NEW_CHOICE ? (newName ?? '').trim() !== '' : (choice ?? '') !== '';

/**
 * What the Publish button checks in the browser: the values as last saved (the server publishes
 * what is saved, not what is typed) and the ready tracks. The server runs the same rules.
 */
export function candidateFromSaved(saved: Raw, readyTracks: number): PublishCandidate {
  return {
    title: saved.title ?? '',
    hasAuthor: chosen(saved.author, saved.newAuthorName),
    hasCategory: (saved.category ?? '') !== '',
    hasNarrator: chosen(saved.narrator, saved.newNarratorName),
    readyTracks,
  };
}
