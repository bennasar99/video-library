import { jsonError, jsonOk } from '@/lib/http';
import { guard } from '@/lib/auth';
import { getScanState } from '@/lib/scan-state';
import { getGeneratorStatus } from '@/workers/media-generator';
import { triggerRescan } from '@/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/scan — current scan status + generator queue state. */
export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const state = getScanState();
  return jsonOk({
    running: state.running,
    rootOk: state.rootOk,
    lastRunAt: state.lastRunAt,
    lastResult: state.lastResult,
    lastError: state.lastError,
    generator: getGeneratorStatus(),
  });
}

/** POST /api/scan — start a rescan. Body: { "full": true } forces a full rescan. */
export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  let full = false;
  try {
    const body = (await req.json()) as { full?: unknown };
    full = body?.full === true;
  } catch {
    // no body — incremental rescan
  }

  const outcome = triggerRescan(full);
  if (outcome === 'already') {
    return jsonError(409, 'A scan is already running');
  }
  // The scan runs in the background; the client polls GET /api/scan.
  void outcome.catch((e) => {
    console.error('[api/scan] background scan failed:', e);
  });
  return jsonOk({ started: true, full }, 202);
}
