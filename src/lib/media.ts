import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

/**
 * FFmpeg / FFprobe integration. All child processes are spawned with
 * explicit argument arrays (no shell), run with a hard timeout, and write
 * to temporary files before being renamed into place, so a crash never
 * leaves a half-written asset behind.
 */

export interface ProbeResult {
  ok: boolean;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  error: string | null;
}

interface ProcessOutput {
  code: number;
  stdout: string;
  stderr: string;
}

function runProcess(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<ProcessOutput> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr: tail(stderr, 500) });
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ code: -1, stdout, stderr: tail(msg, 500) });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already dead */
      }
      finish(-1);
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (err) => {
      stderr += `\n${String(err?.message ?? err)}`;
      finish(-1);
    });
    child.on('close', (code) => finish(code ?? -1));
  });
}

function tail(s: string, max: number): string {
  return s.length <= max ? s : `…${s.slice(-max)}`;
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** Probe a media file with ffprobe. Never throws. */
export async function probeVideo(absPath: string): Promise<ProbeResult> {
  const res = await runProcess(
    config.ffprobePath,
    [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      absPath,
    ],
    30_000,
  );

  if (res.code !== 0) {
    const reason = res.stderr.trim().split('\n').slice(-2).join(' | ').trim();
    return {
      ok: false,
      durationSec: null,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      hasAudio: false,
      error: `ffprobe failed${reason ? `: ${reason}` : ''}`,
    };
  }

  const data = parseJson(res.stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      duration?: string;
    }>;
  } | null;

  if (!data || !Array.isArray(data.streams)) {
    return {
      ok: false,
      durationSec: null,
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: null,
      hasAudio: false,
      error: 'ffprobe returned no streams',
    };
  }

  const videoStream = data.streams.find((s) => s.codec_type === 'video' && s.width && s.height);
  const audioStream = data.streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    return {
      ok: false,
      durationSec: toNumber(data.format?.duration),
      width: null,
      height: null,
      videoCodec: null,
      audioCodec: audioStream?.codec_name ?? null,
      hasAudio: Boolean(audioStream),
      // Not a video (audio-only or no usable video stream) — excluded from catalog.
      error: 'no video stream found',
    };
  }

  const duration = toNumber(videoStream.duration) ?? toNumber(data.format?.duration);

  return {
    ok: true,
    durationSec: duration,
    width: videoStream.width ?? null,
    height: videoStream.height ?? null,
    videoCodec: videoStream.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    hasAudio: Boolean(audioStream),
    error: null,
  };
}

function toNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Version stamp for generated assets: "<size>:<floor(mtimeMs)>". */
export function assetVersion(size: number, mtimeMs: number): string {
  return `${size}:${Math.floor(mtimeMs)}`;
}

/** Pick the timestamp (seconds) to grab the thumbnail from. */
export function pickThumbTime(durationSec: number | null): number {
  if (durationSec === null || !Number.isFinite(durationSec)) return 1;
  if (durationSec < 4) return Math.max(0, durationSec / 2);
  return Math.min(Math.max(0.5, durationSec * 0.1), 15);
}

/**
 * Pick the start time for the preview clip: skip ~30% (intros/titles/black
 * fades) but never so far that the clip would overrun the end of the file.
 */
export function pickPreviewStart(durationSec: number | null, previewSec: number): number {
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (durationSec <= previewSec + 4) return 0;
  return Math.min(durationSec * 0.3, Math.max(0, durationSec - previewSec - 1));
}

/**
 * Temp output path that keeps the final file's extension. FFmpeg infers the
 * container format from the extension, so a plain `X.mp4.tmp` suffix breaks
 * muxer selection ("Unable to choose an output format"). The leading dot
 * also keeps the file out of casual listings.
 */
function tempPathFor(outPath: string): string {
  return path.join(path.dirname(outPath), `.tmp-${path.basename(outPath)}`);
}

/**
 * Encode a single thumbnail frame to WebP.
 * `maxWidth` caps the width (never upscales); height keeps the aspect ratio.
 * The scale filter is computed here from `srcWidth` instead of using an
 * FFmpeg expression like `min(854,iw)`: the comma in such an expression is
 * a filter-chain separator in FFmpeg filtergraph syntax and must be
 * escaped, so plain numeric filters are built on the JS side instead.
 */
export async function encodeThumbnail(
  absPath: string,
  outPath: string,
  atSec: number,
  maxWidth: number,
  srcWidth: number | null,
): Promise<void> {
  const tmpPath = tempPathFor(outPath);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(atSec),
    '-i', absPath,
    '-frames:v', '1',
  ];
  if (srcWidth !== null && srcWidth > 0 && srcWidth > maxWidth) {
    args.push('-vf', `scale=${maxWidth}:-2`);
  }
  // srcWidth <= maxWidth (or unknown): keep the native frame, never upscale.
  args.push(
    '-q:v', '80',
    tmpPath,
  );
  const res = await runProcess(config.ffmpegPath, args, 60_000);
  if (res.code !== 0) {
    await fs.rm(tmpPath, { force: true });
    throw new Error(`thumbnail encode failed: ${res.stderr || 'unknown error'}`);
  }
  await fs.rename(tmpPath, outPath);
}

export interface PreviewOptions {
  startSec: number;
  durationSec: number;
  /** Target height (capped, never upscales). */
  height: number;
  /** Target width (capped, never upscales). */
  width: number;
  srcWidth: number | null;
  srcHeight: number | null;
}

/**
 * Encode a short ~480p H.264 preview clip with faststart for instant web
 * playback. Audio is dropped to keep the clip small (spec: "muted preview").
 */
export async function encodePreview(
  absPath: string,
  outPath: string,
  opts: PreviewOptions,
): Promise<void> {
  const tmpPath = tempPathFor(outPath);

  const filters: string[] = [];
  if ((opts.srcHeight ?? 0) > opts.height) filters.push(`scale=-2:${opts.height}`);
  else if ((opts.srcWidth ?? 0) > opts.width) filters.push(`scale=${opts.width}:-2`);

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', String(opts.startSec),
    '-i', absPath,
    '-t', String(opts.durationSec),
  ];
  if (filters.length > 0) args.push('-vf', filters.join(','));
  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    tmpPath,
  );

  const res = await runProcess(config.ffmpegPath, args, 180_000);
  if (res.code !== 0) {
    await fs.rm(tmpPath, { force: true });
    throw new Error(`preview encode failed: ${res.stderr || 'unknown error'}`);
  }
  await fs.rename(tmpPath, outPath);
}

export function thumbPathFor(id: number): string {
  return path.join(config.thumbsDir, `${id}.webp`);
}

export function previewPathFor(id: number): string {
  return path.join(config.previewsDir, `${id}.mp4`);
}
