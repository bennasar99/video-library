import { eq } from 'drizzle-orm';
import { getDb } from './database';
import { settings } from '../db/schema';
import {
  DEFAULT_PLAYBACK_SETTINGS,
  isPlaybackMode,
  type PlaybackSettings,
} from './types';

const KEY = 'playback';

/** Read playback settings from SQLite (server-side source of truth). */
export function getSettings(): PlaybackSettings {
  const row = getDb().select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) return { ...DEFAULT_PLAYBACK_SETTINGS };
  try {
    const parsed = JSON.parse(row.value) as { mode?: unknown; repeatAll?: unknown };
    return {
      mode: isPlaybackMode(parsed.mode) ? parsed.mode : DEFAULT_PLAYBACK_SETTINGS.mode,
      repeatAll: Boolean(parsed.repeatAll),
    };
  } catch {
    return { ...DEFAULT_PLAYBACK_SETTINGS };
  }
}

/** Persist playback settings to SQLite. */
export function saveSettings(next: PlaybackSettings): PlaybackSettings {
  const db = getDb();
  const clean: PlaybackSettings = {
    mode: isPlaybackMode(next.mode) ? next.mode : DEFAULT_PLAYBACK_SETTINGS.mode,
    repeatAll: Boolean(next.repeatAll),
  };
  db.insert(settings)
    .values({ key: KEY, value: JSON.stringify(clean) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(clean) } })
    .run();
  return clean;
}
