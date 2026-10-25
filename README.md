# Video Library

Self-hosted video library and streaming web app. Point it at a folder of videos; it scans the
folder, generates thumbnails and short preview clips with FFmpeg, and serves a browser-based
catalog and player. Original files are **never modified** — the app only reads them and stores
its own data separately.

**Stack:** Next.js 15 (App Router) · React 19 · SQLite (better-sqlite3 + Drizzle ORM) · FFmpeg

## Features

- Recursive scan of a media folder with incremental background rescans
- Thumbnails (WebP, 854px) and ~6s preview clips (480p MP4) generated in the background
- HTTP Range streaming (seeking works for large files)
- Catalog with folder cards (click to enter), search, sorting and pagination
- Folders shown without previews; videos inside a folder are shown exactly like the library root
- Player with preview mode, repeat-one, and auto-next
- Playback settings persisted server-side (SQLite)
- Corrupt/unplayable files are detected and surfaced instead of hanging the player

## Requirements

| Dependency | Notes |
|---|---|
| Node.js **20+** (tested on Node 22) | Required for Next.js 15 and better-sqlite3 12 |
| FFmpeg + FFprobe | Any recent build. Must be on `PATH`, or point `FFMPEG_PATH`/`FFPROBE_PATH` at the executables |
| A folder of videos | MP4/MKV/etc. — any container FFmpeg can probe |

## Getting started (development)

```bash
# 1. Install dependencies (better-sqlite3 is a native module — it compiles for your platform)
npm install

# 2. Create the environment file
cp .env.example .env        # Windows: copy .env.example .env

# 3. Edit .env — at minimum set VIDEO_ROOT (see below)

# 4. Run
npm run dev                 # http://localhost:3000 (Next.js dev server)
```

On first start the app:

1. opens `DATA_DIR/app.db` and applies Drizzle migrations automatically,
2. creates `DATA_DIR/assets/{thumbs,previews}`,
3. runs an initial scan of `VIDEO_ROOT` in the background,
4. schedules periodic incremental rescans (default every 5 minutes).

Thumbnails/previews appear a few seconds after a video is cataloged, depending on
`GENERATOR_CONCURRENCY` and file size.

## Configuring the media library path

All configuration lives in environment variables. `.env` in the project root is loaded
automatically by Next.js for the Node.js runtime, and by `server.js` (which runs
`npm start` in production).

### `VIDEO_ROOT` — your video folder

```bash
# Linux / macOS
VIDEO_ROOT=/home/you/Videos

# Windows
VIDEO_ROOT=D:\Videos
# forward slashes also work: VIDEO_ROOT=D:/Videos
```

- **Absolute paths are recommended.** Relative paths are resolved against the directory you
  start the server from (see the warning at the end of this section).
- The folder is scanned **recursively**; subfolders become browsable folders in the catalog.
- The app treats it strictly **read-only** — nothing is written into it, and symlinks are not
  followed.
- If the folder doesn't exist, the app still starts, but the catalog shows:
  > "The video folder could not be found. Check `VIDEO_ROOT` in `.env` and restart the server."
- Changing `VIDEO_ROOT` (or any variable) requires **restarting the server** — config is read once at startup.

### `DATA_DIR` — app data (database + generated assets)

```bash
DATA_DIR=./data
```

Everything the app owns lives here:

```
DATA_DIR/
├ app.db              # SQLite catalog + settings
└ assets/
  └ thumbs/           # generated thumbnail .webp files
  └ previews/         # generated preview .mp4 clips
```

**Important: keep `DATA_DIR` *outside* of `VIDEO_ROOT`.** The scanner walks the media tree and
anything stored inside it would be cataloged as content (generated previews are video files —
you'd end up previewing previews).

### `FFMPEG_PATH` / `FFPROBE_PATH`

By default the app looks for `ffmpeg`/`ffprobe` on `PATH`. If they live elsewhere, set absolute
paths to the executables:

```bash
# Windows
FFMPEG_PATH=C:\tools\ffmpeg\bin\ffmpeg.exe
FFPROBE_PATH=C:\tools\ffmpeg\bin\ffprobe.exe

# Linux
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
```

Without a working FFmpeg the catalog still works, but thumbnails/previews stay in a pending
state and previews fall back to the first frame only.

### All environment variables

| Variable | Default | Description |
|---|---|---|
| `VIDEO_ROOT` | `./media` | Folder containing your videos (scanned recursively, read-only) |
| `DATA_DIR` | `./data` | Where the SQLite DB and generated assets are stored — keep outside `VIDEO_ROOT` |
| `PORT` | `8080` | HTTP port (honored by `npm start` via `server.js`) |
| `HOST` | `0.0.0.0` | Bind address. `0.0.0.0` = reachable from other devices on your network |
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Absolute path to the FFmpeg executable, if not on PATH |
| `FFPROBE_PATH` | `ffprobe` (PATH) | Absolute path to the FFprobe executable, if not on PATH |
| `RESCAN_INTERVAL_MS` | `300000` | Incremental rescan interval in ms. `0` disables background rescans |
| `GENERATOR_CONCURRENCY` | `2` | Parallel FFmpeg encode jobs (clamped to 1–8) |
| `PREVIEW_DURATION_SEC` | `6` | Preview clip length in seconds (clamped to 3–20) |
| `AUTH_PASSWORD` | *(empty)* | Optional site password. When set, a login page gates everything and the API answers `401` until it is entered (see [Password protection](#password-protection)) |

> **Run from the project root.** Relative values (`./data`, `./media`) and the migration
> folder are resolved against the process working directory. Always start the server with the
> project directory as the working directory, or use absolute paths in `.env`.

## Production deployment

### 1. Build and run

```bash
npm install          # if not already done
npm run build        # production build into .next/
npm start            # node server.js — loads .env, binds HOST:PORT, enforces auth
```

`npm start` runs `node server.js`, which loads `.env`, binds `HOST`/`PORT` from it
(default `0.0.0.0:8080`) and — when `AUTH_PASSWORD` is set — enforces the password
gate at the HTTP layer. To use a different port, set `PORT=8084` in `.env` and
restart; no script or code changes. The app is then reachable from other devices on
your network (e.g. `http://192.168.1.10:8084`).

### 2. Keep it running

Any process supervisor works, since the app is a single Node process with no other services.

**pm2**

```bash
npm install -g pm2
cd /path/to/video-library
pm2 start npm --name video-library -- start
pm2 save
```

**systemd** (Linux)

```ini
# /etc/systemd/system/video-library.service
[Unit]
Description=Video Library (Next.js)
After=network.target

[Service]
WorkingDirectory=/opt/video-library
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now video-library
journalctl -u video-library -f        # watch startup logs
```

### 3. What happens at startup

```
[services] ready — video root: /home/you/Videos | data dir: /opt/video-library/data
[services] startup scan done: { added: 42, removed: 1, ... }
```

- SQLite migrations are applied automatically on first DB access. The `drizzle/` folder in the
  repo contains the migration files — it must be shipped with the app.
- An initial scan runs in the background; asset generation follows with the configured
  concurrency.
- Incremental rescans keep the catalog in sync with the folder; files deleted from disk (and
  their generated assets) are cleaned up on the next rescan.

### 4. Manual rescans

- **UI:** the scan/re-scan control in the catalog.
- **API:**

```bash
curl -X POST http://localhost:8080/api/scan -H 'Content-Type: application/json' -d '{"full": true}'
curl http://localhost:8080/api/scan          # scan status + generator queue
```

`{"full": true}` forces a complete re-walk; the default is an incremental diff.

### 5. Backup and upgrade

- **Backup = the `DATA_DIR` folder** (database + generated assets). The video originals live
  in `VIDEO_ROOT` and are untouched.
- To upgrade: pull/copy the new code, `npm install`, `npm run build`, restart the process.
  Migrations run automatically on startup.
- If you change the Node.js major version, rebuild the native module: `npm rebuild better-sqlite3`.

## Password protection (optional)

Set a plaintext password in `.env` to lock the whole site behind a login page:

```ini
AUTH_PASSWORD=your-secret
```

Restart `npm start` (no rebuild needed). Behavior:

- **No video information is sent to a client before the password is entered** —
  this is enforced at the transport level, not just in the UI:
  - unauthenticated **API** requests get a bare `401` (no titles, no list, not
    even a “not found” hint);
  - unauthenticated **page** requests get a `302` redirect to `/login`.
  The check runs twice — in `server.js` at the HTTP layer and inside every API
  route handler (`src/lib/auth.ts`) — so the data routes stay protected even
  under bare `npx next start` or `next dev`.
- `/login` asks for the password; on success an `HttpOnly` `vlib_auth` cookie
  (value `SHA-256(AUTH_PASSWORD)`, 30-day lifetime) is set and the browser goes
  to the library. `POST /api/logout` clears the cookie.
- **Changing the password invalidates all existing sessions immediately** (old
  cookies no longer match); restart the server after editing `.env`.
- Comparison is constant-time (SHA-256 + `crypto.timingSafeEqual`); the cookie
  never contains the password itself.

Leave `AUTH_PASSWORD` empty/unset for open access (the default — fine for a
trusted LAN, or put your own reverse-proxy authentication in front).

## API surface

| Route | Methods | Purpose |
|---|---|---|
| `/api/videos` | GET | Catalog list. Query: `search`, `dir`, `page`, `pageSize`, `sort`, `order`. Browsing a `dir` lists its direct videos plus a `folders` array; searching includes its subfolders |
| `/api/videos/[id]` | GET | Video detail (metadata, status, asset URLs) |
| `/api/stream/[id]` | GET | Original file, HTTP Range (seeking) |
| `/api/assets/[type]/[id]` | GET | Generated asset; `type` = `thumb` or `preview` |
| `/api/scan` | GET, POST | Scan status / trigger rescan (`{"full": true}`) |
| `/api/regenerate` | POST | Regenerate an asset (`{"id": n, "type": "thumb"}`) or all (`{}`) |
| `/api/settings` | GET, PUT | Playback settings (`mode`: `off` / `repeat-one` / `auto-next`, `repeatAll`) |
| `/api/login` | POST | Set the session cookie (body `{"password": "..."}`); only relevant when `AUTH_PASSWORD` is set |
| `/api/logout` | POST | Clear the session cookie |

Pages: `/` (catalog), `/watch/[id]` (player) and `/login` (password gate — only
relevant when `AUTH_PASSWORD` is set).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "The video folder could not be found" banner | `VIDEO_ROOT` points to a missing/wrong folder — fix `.env` and restart. Check the `video root:` path in the startup log. |
| No thumbnails or previews appear | FFmpeg is missing or unreachable: verify `ffmpeg -version` / `ffprobe -version` work as the server user, or set `FFMPEG_PATH`/`FFPROBE_PATH`. Check server logs for encode errors. |
| Port already in use | Change `PORT` in `.env` (e.g. `8084`) and restart. |
| App only reachable locally | Confirm `HOST=0.0.0.0` in `.env` (`server.js` binds it; the default is `0.0.0.0`). |
| `better-sqlite3` load errors after a Node upgrade | `npm rebuild better-sqlite3` |
| Migrations error on startup | The server must run with the project directory as working directory (the app loads `drizzle/` from `process.cwd()`). |
| Generated assets appearing inside the media folder | `DATA_DIR` is inside `VIDEO_ROOT` — move it out (see above). |
| Site asks for a password / APIs answer `401` | `AUTH_PASSWORD` is set in `.env`. Enter it on the `/login` page, or remove the variable and restart to disable. |

## Development

```bash
npm run dev          # dev server (Next.js)
npm test             # vitest unit tests
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

The test suite includes a component-level regression test (`src/components/VideoPlayer.test.tsx`)
that guards against the hook-order bug that once crashed the watch page (React error #310).
