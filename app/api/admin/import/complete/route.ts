import { handleComplete } from '@/features/admin/import/handlers';
import { importDeps } from '../deps';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/import/complete — step 3 of the content import: the files have been sent to the
 * addresses from step 1. Checks them in storage, makes the parts ready and, if asked, publishes.
 */
export async function POST(request: Request) {
  return handleComplete(request, importDeps());
}
