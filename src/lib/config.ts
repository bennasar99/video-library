import path from 'node:path';

/**
 * Central application configuration.
 *
 * All values come from environment variables (Next.js loads `.env` files
 * automatically for the Node.js runtime). Nothing here may be imported from
 * client components — this module resolves absolute filesystem paths.
 */

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  /** Absolute path of the user's video library (read-only from our side). */
  videoRoot: string;
  /** Absolute path of the data directory (SQLite + generated assets). */
  dataDir: string;
  assetsDir: string;
  thumbsDir: string;
  previewsDir: string;
  dbFile: string;
  ffmpegPath: string;
  ffprobePath: string;
  /** Periodic incremental rescan interval in ms (0 disables). */
  rescanIntervalMs: number;
  /** Max parallel FFmpeg encode jobs. */
  generatorConcurrency: number;
  /** Length of generated preview clips in seconds. */
  previewDurationSec: number;
  /** Target height for preview clips (480p). */
  previewHeight: number;
  /** Target width for thumbnails / preview clips. */
  thumbWidth: number;
}

export function loadConfig(): AppConfig {
  const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
  return {
    port: intFromEnv('PORT', 8080),
    host: process.env.HOST ?? '0.0.0.0',
    videoRoot: path.resolve(process.env.VIDEO_ROOT ?? './media'),
    dataDir,
    assetsDir: path.join(dataDir, 'assets'),
    thumbsDir: path.join(dataDir, 'assets', 'thumbs'),
    previewsDir: path.join(dataDir, 'assets', 'previews'),
    dbFile: path.join(dataDir, 'app.db'),
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    rescanIntervalMs: Math.max(0, intFromEnv('RESCAN_INTERVAL_MS', 300_000)),
    generatorConcurrency: Math.min(8, Math.max(1, intFromEnv('GENERATOR_CONCURRENCY', 2))),
    previewDurationSec: Math.min(20, Math.max(3, intFromEnv('PREVIEW_DURATION_SEC', 6))),
    previewHeight: 480,
    thumbWidth: 854,
  };
}

export const config: AppConfig = loadConfig();
