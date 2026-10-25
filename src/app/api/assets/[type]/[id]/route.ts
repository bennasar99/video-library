import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/database';
import { videos } from '@/db/schema';
import { jsonError, parseIdParam } from '@/lib/http';
import { guard } from '@/lib/auth';
import { PREVIEW_MIME, THUMB_MIME } from '@/lib/mime';
import { previewPathFor, thumbPathFor } from '@/lib/media';
import { serveFileRange } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ type: string; id: string }> };

/**
 * Serves generated assets:
 *   GET /api/assets/thumb/<id>   — WebP thumbnail (image)
 *   GET /api/assets/preview/<id> — short 480p MP4 preview clip (video, range-aware)
 *
 * The `?v=<assetVersion>` query parameter from the client busts caches when
 * a source file changes and its assets are regenerated.
 */
export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const { type, id: rawId } = await ctx.params;
  if (type !== 'thumb' && type !== 'preview') return jsonError(400, 'Invalid asset type');
  const id = parseIdParam(rawId);
  if (id === null) return jsonError(400, 'Invalid video id');

  const row = getDb().select().from(videos).where(eq(videos.id, id)).get();
  if (!row) return jsonError(404, 'Video not found');

  const ready = type === 'thumb' ? row.hasThumb : row.hasPreview;
  if (!ready) {
    return jsonError(404, 'Asset not generated yet — it will appear after the background job finishes');
  }

  return serveFileRange(req, type === 'thumb' ? thumbPathFor(id) : previewPathFor(id), {
    contentType: type === 'thumb' ? THUMB_MIME : PREVIEW_MIME,
    cacheControl: 'public, max-age=86400',
    etag: row.assetVersion,
    missingMessage: 'Asset file is missing — it will be regenerated on the next rescan',
  });
}
