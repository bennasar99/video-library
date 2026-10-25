import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { config } from '../lib/config';
import { getDb } from '../lib/database';
import { videos } from '../db/schema';
import {
  assetVersion,
  encodePreview,
  encodeThumbnail,
  pickPreviewStart,
  pickThumbTime,
  previewPathFor,
  thumbPathFor,
} from '../lib/media';
import { resolveRelPath } from '../lib/paths';

/**
 * Background asset generator: turns catalog rows into thumbnails (WebP) and
 * short preview clips (480p MP4) using FFmpeg.
 *
 * A bounded queue (default 2 parallel jobs, GENERATOR_CONCURRENCY) prevents
 * the CPU from saturating on large libraries. State lives on globalThis so
 * hot reloads and separate module instances share the same queue.
 */

export interface AssetJob {
  videoId: number;
  force?: boolean;
  /** Restrict the job to one asset kind (regenerate button in UI). */
  kind?: 'thumb' | 'preview';
}

interface GeneratorState {
  queue: AssetJob[];
  active: number;
}

const GLOBAL_KEY = '__vlib_gen_state';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: GeneratorState };

function state(): GeneratorState {
  const g = globalThis as GlobalShape;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { queue: [], active: 0 };
  }
  return g[GLOBAL_KEY];
}

export function getGeneratorStatus(): { queued: number; active: number } {
  const s = state();
  return { queued: s.queue.length, active: s.active };
}

/** Enqueue asset jobs and start pumping. */
export function queueAssetJobs(jobs: AssetJob[]): void {
  const s = state();
  for (const job of jobs) s.queue.push(job);
  pump();
}

function pump(): void {
  const s = state();
  while (s.active < config.generatorConcurrency && s.queue.length > 0) {
    const job = s.queue.shift()!;
    s.active++;
    void processJob(job)
      .catch((err) => {
        console.error('[generator] job failed', job, err?.message ?? err);
      })
      .finally(() => {
        s.active--;
        pump();
      });
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function lastError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length <= 500 ? msg : msg.slice(-500);
}

async function processJob(job: AssetJob): Promise<void> {
  const db = getDb();
  const row = db.select().from(videos).where(eq(videos.id, job.videoId)).get();
  if (!row || row.status !== 'ok') return; // file was removed / never playable

  const absPath = resolveRelPath(config.videoRoot, row.relPath);
  const version = assetVersion(row.size, row.mtimeMs);
  const only = job.kind;
  const update = (fields: Record<string, unknown>) =>
    db.update(videos).set({ ...fields, updatedAt: Date.now() }).where(eq(videos.id, row.id)).run();

  // Tracks a failed thumbnail across steps so a later successful preview
  // does not wipe it out of the asset_error column.
  let thumbError: string | null = null;

  try {
    // ---- Thumbnail -----------------------------------------------------
    if (!only || only === 'thumb') {
      const thumbNeeded = job.force || !row.hasThumb || row.assetVersion !== version;
      if (thumbNeeded) {
        await ensureDir(config.thumbsDir);
        try {
          await encodeThumbnail(absPath, thumbPathFor(row.id), pickThumbTime(row.durationSec), config.thumbWidth, row.width);
          // Leave assetError alone here; it is reconciled after the preview.
          update({ hasThumb: true });
        } catch (e) {
          thumbError = lastError(e);
          update({ hasThumb: false, assetError: thumbError });
        }
      }
    }

    // ---- Preview ---------------------------------------------------------
    if (!only || only === 'preview') {
      const previewNeeded = job.force || !row.hasPreview || row.assetVersion !== version;
      if (previewNeeded) {
        await ensureDir(config.previewsDir);
        try {
          await encodePreview(absPath, previewPathFor(row.id), {
            startSec: pickPreviewStart(row.durationSec, config.previewDurationSec),
            durationSec: config.previewDurationSec,
            height: config.previewHeight,
            width: config.thumbWidth,
            srcWidth: row.width,
            srcHeight: row.height,
          });
          if (only === 'preview') {
            // Single-asset job: don't touch version or error state we did not test.
            update({ hasPreview: true });
          } else {
            // Full job: the preview is the long pole — stamp the version only
            // once it succeeded, keep it if the thumbnail failed (so the
            // next scan retries both), and reconcile the error column.
            update({
              hasPreview: true,
              assetVersion: thumbError === null ? version : row.assetVersion,
              assetError: thumbError,
            });
          }
        } catch (e) {
          update({ hasPreview: false, assetError: lastError(e) });
        }
      }
    }
  } catch (e) {
    // e.g. the file disappeared from disk mid-job — keep the row, record it.
    update({ assetError: lastError(e) });
    throw e;
  }
}

/** Queue regeneration for every playable video (Rescan → "Regenerate all"). */
export function regenerateAll(kind?: 'thumb' | 'preview'): number {
  const db = getDb();
  const rows = db.select().from(videos).where(eq(videos.status, 'ok')).all();
  const jobs: AssetJob[] = rows.map((r) => ({ videoId: r.id, force: true, kind }));
  queueAssetJobs(jobs);
  return jobs.length;
}

/** Queue regeneration for a single video. Returns the number queued (0 if row missing). */
export function regenerateVideo(videoId: number, kind?: 'thumb' | 'preview'): number {
  const db = getDb();
  const row = db.select().from(videos).where(eq(videos.id, videoId)).get();
  if (!row || row.status !== 'ok') return 0;
  queueAssetJobs([{ videoId, force: true, kind }]);
  return 1;
}

