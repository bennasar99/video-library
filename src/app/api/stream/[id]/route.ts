import { eq } from 'drizzle-orm';
import { config } from '@/lib/config';
import { getDb } from '@/lib/database';
import { videos } from '@/db/schema';
import { jsonError, parseIdParam } from '@/lib/http';
import { guard } from '@/lib/auth';
import { mimeForExt } from '@/lib/mime';
import { resolveRelPath } from '@/lib/paths';
import { serveFileRange } from '@/lib/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Streams the ORIGINAL file with HTTP byte-range support (206/416) so the
 * HTML5 video player can seek. Content-Type is chosen per extension; for
 * container formats the browser cannot demux (MKV, AVI, ...) the player
 * shows a friendly decode error and a download link instead of hanging.
 */
export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = parseIdParam(rawId);
  if (id === null) return jsonError(400, 'Invalid video id');

  const row = getDb().select().from(videos).where(eq(videos.id, id)).get();
  if (!row) return jsonError(404, 'Video not found — try running a rescan');

  let absPath: string;
  try {
    absPath = resolveRelPath(config.videoRoot, row.relPath);
  } catch {
    return jsonError(400, 'Invalid stored path');
  }

  return serveFileRange(req, absPath, {
    contentType: mimeForExt(row.ext),
    cacheControl: 'no-cache',
    missingMessage: 'File is missing from disk — run a rescan to refresh the catalog',
  });
}
