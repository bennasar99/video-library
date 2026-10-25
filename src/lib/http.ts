import type { VideoRow } from '../db/schema';
import type { VideoInfo } from './types';

/** Small helpers shared by API route handlers. */

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** Validate a numeric id coming from a URL path segment. */
export function parseIdParam(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Escape LIKE wildcards so user input is treated literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Map a catalog row to the API shape (no filesystem paths leak out). */
export function serializeVideo(row: VideoRow): VideoInfo {
  return {
    id: row.id,
    title: row.title,
    relPath: row.relPath,
    dir: row.dir,
    ext: row.ext,
    size: row.size,
    mtimeMs: row.mtimeMs,
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    videoCodec: row.videoCodec,
    audioCodec: row.audioCodec,
    hasAudio: row.hasAudio,
    status: row.status === 'error' ? 'error' : 'ok',
    probeError: row.probeError,
    hasThumb: row.hasThumb,
    hasPreview: row.hasPreview,
    assetVersion: row.assetVersion,
    addedAt: row.addedAt,
  };
}
