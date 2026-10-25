CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rel_path` text NOT NULL,
	`title` text NOT NULL,
	`dir` text DEFAULT '' NOT NULL,
	`ext` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`mtime_ms` integer DEFAULT 0 NOT NULL,
	`duration_sec` real,
	`width` integer,
	`height` integer,
	`video_codec` text,
	`audio_codec` text,
	`has_audio` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`probe_error` text,
	`asset_version` text,
	`asset_error` text,
	`has_thumb` integer DEFAULT false NOT NULL,
	`has_preview` integer DEFAULT false NOT NULL,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `videos_rel_path_unique` ON `videos` (`rel_path`);