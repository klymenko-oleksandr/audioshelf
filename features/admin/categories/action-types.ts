import type { AdminCategory } from './data';
import type { CategoryErrors } from './values';

export type CategoryActionResult =
  | { ok: true; categories: AdminCategory[] }
  | { ok: false; message?: string; errors?: CategoryErrors };
