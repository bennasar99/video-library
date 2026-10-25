/**
 * Shared types used by both the API (server) and the UI (client).
 * This module must stay free of Node.js imports.
 */

export interface VideoInfo {
  id: number;
  title: string;
  /** Relative path under the video root (never an absolute filesystem path). */
  relPath: string;
  dir: string;
  ext: string;
  size: number;
  mtimeMs: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
  status: 'ok' | 'error';
  probeError: string | null;
  hasThumb: boolean;
  hasPreview: boolean;
  assetVersion: string | null;
  addedAt: number;
}

export type SortField = 'name' | 'duration' | 'modified' | 'size' | 'added';
export type SortOrder = 'asc' | 'desc';

/** A subfolder of the directory currently being browsed. */
export interface FolderInfo {
  /** Folder name shown as the card title. */
  name: string;
  /** Folder path relative to VIDEO_ROOT (forward slashes) — use as `dir`. */
  path: string;
  /** Videos inside this folder, including nested subfolders. */
  videoCount: number;
}

export interface VideosResponse {
  items: VideoInfo[];
  total: number;
  page: number;
  pageSize: number;
  /** Subfolders of the current directory. */
  folders: FolderInfo[];
  /** Directory being browsed, relative to VIDEO_ROOT ('' = root). */
  dir: string;
  /** Whether VIDEO_ROOT exists and is a directory. */
  rootOk: boolean;
}

export interface ScanResult {
  added: number;
  changed: number;
  removed: number;
  probeErrors: number;
  total: number;
}

export interface GeneratorStatus {
  queued: number;
  active: number;
}

export interface ScanStatus {
  running: boolean;
  rootOk: boolean | null;
  lastRunAt: number | null;
  lastResult: ScanResult | null;
  lastError: string | null;
  generator: GeneratorStatus;
}

export type PlaybackMode = 'off' | 'repeat-one' | 'auto-next';

export interface PlaybackSettings {
  /**
   * 'off'         — stop when the video ends.
   * 'repeat-one'  — replay the same video when it ends.
   * 'auto-next'   — play the next video in the queue when it ends.
   */
  mode: PlaybackMode;
  /**
   * Separate from the mode: when auto-next reaches the last item, wrap to
   * the first instead of stopping.
   */
  repeatAll: boolean;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  mode: 'off',
  repeatAll: false,
};

export function isPlaybackMode(v: unknown): v is PlaybackMode {
  return v === 'off' || v === 'repeat-one' || v === 'auto-next';
}
