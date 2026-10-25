import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/database';
import { videos } from '@/db/schema';
import { jsonError, parseIdParam, serializeVideo } from '@/lib/http';
import { guard } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = parseIdParam(rawId);
  if (id === null) return jsonError(400, 'Invalid video id');

  const row = getDb().select().from(videos).where(eq(videos.id, id)).get();
  if (!row) return jsonError(404, 'Video not found — try running a rescan');

  return Response.json(serializeVideo(row));
}
