import type { Requirement } from './rules';

export type BookActionResult =
  { ok: true } | { ok: false; message: string; missing?: Requirement[]; mismatch?: boolean };
