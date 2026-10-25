import { parseIdParam, jsonError, jsonOk } from '@/lib/http';
import { guard } from '@/lib/auth';
import { regenerateAll, regenerateVideo } from '@/workers/media-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/regenerate
 * Body (all optional): { "id": 123, "type": "thumb" | "preview" }
 *   - no id        → regenerate all videos
 *   - id only      → regenerate both assets for that video
 *   - id + type    → regenerate just that asset
 */
export async function POST(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  let body: { id?: unknown; type?: unknown } = {};
  try {
    body = (await req.json()) as { id?: unknown; type?: unknown };
  } catch {
    body = {};
  }

  let kind: 'thumb' | 'preview' | undefined;
  if (body.type !== undefined) {
    if (body.type !== 'thumb' && body.type !== 'preview') {
      return jsonError(400, 'type must be "thumb" or "preview"');
    }
    kind = body.type;
  }

  if (body.id !== undefined) {
    const id = typeof body.id === 'number' ? parseIdParam(String(body.id)) : null;
    if (id === null) return jsonError(400, 'Invalid video id');
    const queued = regenerateVideo(id, kind);
    if (queued === 0) return jsonError(404, 'Video not found or not playable');
    return jsonOk({ queued });
  }

  const queued = regenerateAll(kind);
  return jsonOk({ queued });
}
