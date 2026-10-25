import { getSettings, saveSettings } from '@/lib/settings';
import { jsonError, jsonOk } from '@/lib/http';
import { guard } from '@/lib/auth';
import { isPlaybackMode, type PlaybackSettings } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/settings — current playback settings. */
export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  return jsonOk(getSettings());
}

/** PUT /api/settings — update playback settings. Body: { mode, repeatAll } */
export async function PUT(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  let body: { mode?: unknown; repeatAll?: unknown };
  try {
    body = (await req.json()) as { mode?: unknown; repeatAll?: unknown };
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const current = getSettings();
  const next: PlaybackSettings = {
    mode: body.mode === undefined ? current.mode : isPlaybackMode(body.mode) ? body.mode : current.mode,
    repeatAll:
      body.repeatAll === undefined ? current.repeatAll : Boolean(body.repeatAll),
  };
  if (body.mode !== undefined && !isPlaybackMode(body.mode)) {
    return jsonError(400, 'mode must be one of: off, repeat-one, auto-next');
  }
  return jsonOk(saveSettings(next));
}
