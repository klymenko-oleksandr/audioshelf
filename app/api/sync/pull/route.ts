import { handlePull } from '@/features/sync/handlers';
import { syncDeps } from '../deps';

export const dynamic = 'force-dynamic';

/** GET /api/sync/pull?since=<seq>&deviceId=<uuid> — every row changed after the cursor. */
export async function GET(request: Request) {
  return handlePull(request, syncDeps());
}
