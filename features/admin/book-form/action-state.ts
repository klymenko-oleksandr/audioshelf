import type { RawForm } from './form-state';
import type { FieldErrors } from './values';

/** What saving a book tells the form. */
export type SaveBookState =
  | { status: 'idle' }
  /** `submitted` is what was saved, so the form knows it has no unsaved changes. */
  | { status: 'saved'; savedAt: string; submitted: RawForm }
  | { status: 'error'; errors: FieldErrors; message?: string };

export const IDLE: SaveBookState = { status: 'idle' };
