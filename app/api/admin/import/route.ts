import { handleBegin } from '@/features/admin/import/handlers';
import { importDeps } from './deps';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/import — step 1 of the content import (Phase 4e). Body: `{ "book": <book.json> }`.
 * Creates the book as a draft (or finds it by slug) and answers with an upload address for every
 * part that is not in the book yet. Bearer token only; see `features/admin/import`.
 */
export async function POST(request: Request) {
  return handleBegin(request, importDeps());
}
