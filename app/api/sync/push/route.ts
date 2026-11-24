import { handlePush } from '@/features/sync/handlers';
import { syncDeps } from '../deps';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/push — the device's changes (Phase 6b). JSON only, at most 1 MB, same origin;
 * works with `navigator.sendBeacon`. Signed-in listeners only; see `features/sync`.
 */
export async function POST(request: Request) {
  return handlePush(request, syncDeps());
}
