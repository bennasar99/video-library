import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { config } from './config';
import { getDb } from './database';
import { videos } from '../db/schema';
import { assetVersion, probeVideo } from './media';
import { getScanState } from './scan-state';
import { queueAssetJobs } from '../workers/media-generator';
import type { ScanResult } from './types';

/**
 * Library scanner: walks VIDEO_ROOT, diffs against the SQLite catalog,
 * probes new/changed files with ffprobe, removes deleted files (and their
 * generated assets), and queues thumbnail/preview generation.
 *
 * Incremental mode only re-probes files whose size or mtime changed; a full
 * scan re-probes everything.
 */

const VIDEO_EXTENSIONS = new Set([
  '3gp', 'asf', 'avi', 'divx', 'f4v', 'flv', 'mkv', 'm4v', 'mov', 'mp4',
  'mpg', 'mpeg', 'm2ts', 'mts', 'ogv', 'ts', 'webm', 'wmv', 'vob',
]);

/** Incomplete-download / partial file markers are ignored. */
const IGNORED_EXTENSIONS = new Set(['.part', '.tmp', '.temp', '.partial', '.download']);

export interface WalkFile {
  relPath: string; // forward-slash relative path under VIDEO_ROOT
  absPath: string;
  size: number;
  mtimeMs: number;
}

export async function walkVideoFiles(root: string): Promise<WalkFile[]> {
  const found: WalkFile[] = [];
  const dataAbs = config.dataDir;

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable directory — skip gracefully
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (absPath === dataAbs) continue; // never scan our own data dir
        await walk(absPath, relPath);
      } else if (entry.isFile()) {
        // entry.isFile() is lstat-based: symlinks are NOT followed, which
        // also prevents links that point outside VIDEO_ROOT.
        let stat;
        try {
          stat = await fs.stat(absPath);
        } catch {
          continue;
        }
        if (!stat.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) continue;
        if (!VIDEO_EXTENSIONS.has(ext.slice(1))) continue;
        found.push({ relPath, absPath, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  }

  await walk(root, '');
  return found;
}

/** Simple bounded-concurrency pool (no external dependency). */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

async function deleteVideoRow(videoId: number): Promise<void> {
  const db = getDb();
  db.delete(videos).where(eq(videos.id, videoId)).run();
  // Best-effort cleanup of generated assets.
  const thumb = path.join(config.thumbsDir, `${videoId}.webp`);
  const preview = path.join(config.previewsDir, `${videoId}.mp4`);
  await fs.rm(thumb, { force: true });
  await fs.rm(preview, { force: true });
}

/**
 * Insert or update the catalog row for one file based on an ffprobe result.
 * Returns 'added' | 'updated' | 'ignored' (audio-only / no video stream).
 */
async function upsertFromProbe(f: WalkFile, now: number): Promise<'ok' | 'error' | 'ignored'> {
  const db = getDb();
  const probe = await probeVideo(f.absPath);
  const name = path.basename(f.absPath);
  const ext = path.extname(name).toLowerCase().slice(1);
  const title = name.slice(0, name.length - (ext.length + 1)) || name;
  const dir = f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : '';

  const fields = {
    relPath: f.relPath,
    title,
    dir,
    ext,
    size: f.size,
    mtimeMs: f.mtimeMs,
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
    videoCodec: probe.videoCodec,
    audioCodec: probe.audioCodec,
    hasAudio: probe.hasAudio,
    probeError: probe.error,
    updatedAt: now,
  };

  if (!probe.ok && probe.width === null) {
    if (probe.error === 'no video stream found') {
      // Audio-only or otherwise not a video: drop the row if present.
      const existing = db.select({ id: videos.id }).from(videos).where(eq(videos.relPath, f.relPath)).get();
      if (existing) await deleteVideoRow(existing.id);
      return 'ignored';
    }
    // Corrupt / unreadable / unsupported container: keep it visible with status 'error'.
    db.insert(videos)
      .values({ ...fields, status: 'error', addedAt: now })
      .onConflictDoUpdate({ target: videos.relPath, set: fields })
      .run();
    return 'error';
  }

  db.insert(videos)
    .values({ ...fields, status: 'ok', addedAt: now })
    .onConflictDoUpdate({ target: videos.relPath, set: fields })
    .run();
  return 'ok';
}

/**
 * Scan the library and reconcile the catalog.
 * Throws if a scan is already running.
 */
export async function scanLibrary(opts: { full?: boolean } = {}): Promise<ScanResult> {
  const scanState = getScanState();
  if (scanState.running) throw new Error('A scan is already running');
  scanState.running = true;
  scanState.lastError = null;

  const result: ScanResult = { added: 0, changed: 0, removed: 0, probeErrors: 0, total: 0 };

  try {
    const db = getDb();
    const now = Date.now();

    const rootOk = await fs
      .stat(config.videoRoot)
      .then((s) => s.isDirectory())
      .catch(() => false);
    scanState.rootOk = rootOk;

    const files = rootOk ? await walkVideoFiles(config.videoRoot) : [];
    const existing = db.select().from(videos).all();
    const byPath = new Map(existing.map((r) => [r.relPath, r]));
    const seen = new Set<string>();

    const probeJobs: WalkFile[] = [];
    for (const f of files) {
      seen.add(f.relPath);
      const row = byPath.get(f.relPath);
      if (!row) {
        result.added++;
        probeJobs.push(f);
      } else if (opts.full || row.size !== f.size || row.mtimeMs !== f.mtimeMs) {
        result.changed++;
        probeJobs.push(f);
        // Refresh size/mtime immediately so the UI shows the new file size.
        db.update(videos)
          .set({ size: f.size, mtimeMs: f.mtimeMs, updatedAt: now })
          .where(eq(videos.id, row.id))
          .run();
      }
    }

    // Remove entries whose file disappeared from disk.
    for (const row of byPath.values()) {
      if (!seen.has(row.relPath)) {
        await deleteVideoRow(row.id);
        result.removed++;
      }
    }

    // Probe new/changed files with limited concurrency.
    await runPool(probeJobs, 3, async (f) => {
      const outcome = await upsertFromProbe(f, now);
      if (outcome === 'error') result.probeErrors++;
      if (outcome === 'ignored') {
        // It was not added to the catalog after all.
        result.added = Math.max(0, result.added - 1);
      }
    });

    result.total = db.select({ id: videos.id }).from(videos).all().length;

    // Queue asset generation for rows that lack assets (or whose source changed).
    const needAssets = db.select().from(videos).all().filter((r) => {
      if (r.status !== 'ok') return false;
      const version = assetVersion(r.size, r.mtimeMs);
      return !(r.assetVersion === version && r.hasThumb && r.hasPreview);
    });
    if (needAssets.length > 0) {
      queueAssetJobs(needAssets.map((r) => ({ videoId: r.id })));
    }

    scanState.lastRunAt = Date.now();
    scanState.lastResult = result;
    return result;
  } catch (e) {
    scanState.lastError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    scanState.running = false;
  }
}

