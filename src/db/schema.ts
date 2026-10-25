import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Catalog metadata for every video discovered under VIDEO_ROOT.
 * Original files are never modified; this table only stores metadata and
 * references to generated assets.
 */
export const videos = sqliteTable('videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Path relative to VIDEO_ROOT, using forward slashes (unique key). */
  relPath: text('rel_path').notNull().unique(),
  /** Display title (file name without extension). */
  title: text('title').notNull(),
  /** Directory relative to VIDEO_ROOT ('' when in the root). */
  dir: text('dir').notNull().default(''),
  /** Lower-case file extension without the dot. */
  ext: text('ext').notNull().default(''),
  size: integer('size').notNull().default(0),
  /** Filesystem modification time (ms since epoch) — used for incremental scans. */
  mtimeMs: integer('mtime_ms').notNull().default(0),
  durationSec: real('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  videoCodec: text('video_codec'),
  audioCodec: text('audio_codec'),
  hasAudio: integer('has_audio', { mode: 'boolean' }).notNull().default(false),
  /** 'ok' | 'error' — 'error' means the file could not be probed. */
  status: text('status').notNull().default('ok'),
  probeError: text('probe_error'),
  /**
   * Version stamp of the generated assets: "<size>:<floor(mtimeMs)>".
   * Assets are regenerated when the source file's size or mtime changes.
   */
  assetVersion: text('asset_version'),
  assetError: text('asset_error'),
  hasThumb: integer('has_thumb', { mode: 'boolean' }).notNull().default(false),
  hasPreview: integer('has_preview', { mode: 'boolean' }).notNull().default(false),
  addedAt: integer('added_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Small key/value store for user settings (e.g. playback mode). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type VideoRow = typeof videos.$inferSelect;
export type NewVideoRow = typeof videos.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
