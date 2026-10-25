'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJSON, fmtDuration, putJSON } from '@/lib/client-api';
import { nextPlayableIndex, onEnded, prevPlayableIndex } from '@/lib/playback';
import {
  DEFAULT_PLAYBACK_SETTINGS,
  isPlaybackMode,
  type PlaybackMode,
  type PlaybackSettings,
  type VideoInfo,
  type VideosResponse,
} from '@/lib/types';
import {
  AlertIcon,
  AutoNextIcon,
  BackIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  RepeatAllIcon,
  RepeatOneIcon,
  ReplayIcon,
  SkipNextIcon,
  SkipPrevIcon,
  SpinnerIcon,
  VolumeIcon,
  VolumeMuteIcon,
} from './icons';

const SETTINGS_KEY = 'vlib.settings';
const VOLUME_KEY = 'vlib.volume';
const QUEUE_KEY = 'vlib.queue';

interface StoredQueue {
  items: VideoInfo[];
  savedAt: number;
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function mediaErrorMessage(code: number | null, video: VideoInfo | null): string {
  switch (code) {
    case 4:
      return 'The video file could not be found — it may have been moved or deleted. Run a rescan from the library page.';
    case 3:
      return `Your browser cannot decode this video${
        video?.videoCodec ? ` (${video.videoCodec}${video.ext ? ' in a ' + video.ext.toUpperCase() : ''} file)` : ''
      }. Try another browser or download the file instead.`;
    case 2:
      return 'The video stream could not be loaded. Check your connection to the server and try again.';
    default:
      return 'This video could not be played.';
  }
}

function Timeline({
  duration,
  value,
  buffered,
  disabled,
  onScrub,
  onScrubEnd,
}: {
  duration: number;
  value: number;
  buffered: number;
  disabled: boolean;
  onScrub: (t: number) => void;
  onScrubEnd: () => void;
}) {
  const pct = duration > 0 ? Math.min(100, (value / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  return (
    <div className="group/tl relative h-6 w-full">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-all group-hover/tl:h-2.5">
        <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufferedPct}%` }} />
        <div className="absolute inset-y-0 left-0 bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        className="vlib-seek absolute inset-0"
        aria-label="Seek"
        min={0}
        max={Math.max(1, Math.round(duration * 1000))}
        step={1}
        value={Math.round(value * 1000)}
        disabled={disabled}
        onInput={(e) => onScrub(Number((e.target as HTMLInputElement).value) / 1000)}
        onChange={(e) => {
          onScrub(Number((e.target as HTMLInputElement).value) / 1000);
          onScrubEnd();
        }}
      />
    </div>
  );
}

export default function VideoPlayer({ id }: { id: number }) {
  const router = useRouter();

  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<VideoInfo[]>([]);
  const [idx, setIdx] = useState(0);
  const [settings, setSettings] = useState<PlaybackSettings>({ ...DEFAULT_PLAYBACK_SETTINGS });
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ended, setEnded] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const preloadRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lastPosSaveRef = useRef(0);
  const lastScrubRef = useRef(0);
  const pendingPlayRef = useRef(true);
  const autoRef = useRef({ advancing: false, skips: 0 });

  const current = queue[idx] ?? null;
  const streamUrl = current ? `/api/stream/${current.id}` : null;

  // Restore local settings, then merge in the server copy.
  useEffect(() => {
    const local = readJson<Partial<PlaybackSettings>>(localStorage, SETTINGS_KEY);
    if (local && isPlaybackMode(local.mode)) {
      setSettings({ mode: local.mode, repeatAll: Boolean(local.repeatAll) });
    }
    const vol = readJson<{ v: number }>(localStorage, VOLUME_KEY);
    if (vol && Number.isFinite(vol.v)) setVolume(Math.min(1, Math.max(0, vol.v)));
    fetchJSON<PlaybackSettings>('/api/settings')
      .then((remote) => setSettings({ mode: remote.mode, repeatAll: remote.repeatAll }))
      .catch(() => {
        /* keep the locally stored settings */
      });
  }, []);

  const updateSettings = useCallback((patch: Partial<PlaybackSettings>) => {
    setSettings((prev) => {
      const next: PlaybackSettings = {
        mode: patch.mode !== undefined ? patch.mode : prev.mode,
        repeatAll: patch.repeatAll !== undefined ? patch.repeatAll : prev.repeatAll,
      };
      writeJson(localStorage, SETTINGS_KEY, next);
      putJSON('/api/settings', next).catch(() => {
        /* local copy already saved */
      });
      return next;
    });
  }, []);

  // Load the video detail + the full queue (shared with the library page).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchJSON<VideoInfo>(`/api/videos/${id}`);
        if (cancelled) return;
        setVideo(detail);
        setLoadError(null);

        let items: VideoInfo[];
        const stored = readJson<StoredQueue>(sessionStorage, QUEUE_KEY);
        if (stored && Array.isArray(stored.items) && stored.items.length > 0 && stored.items.some((v) => v.id === id)) {
          items = stored.items;
        } else {
          // Direct links have no stored queue: use the video's folder.
          const q = new URLSearchParams({ pageSize: '100000', sort: 'name', order: 'asc' });
          if (detail.dir) q.set('dir', detail.dir);
          const all = await fetchJSON<VideosResponse>(`/api/videos?${q.toString()}`);
          if (cancelled) return;
          items = all.items.length > 0 && all.items.some((v) => v.id === id) ? all.items : [detail];
          const store: StoredQueue = { items: items.slice(0, 2000), savedAt: Date.now() };
          writeJson(sessionStorage, QUEUE_KEY, store);
        }
        if (cancelled) return;
        setQueue(items);
        const found = items.findIndex((v) => v.id === id);
        setIdx(found === -1 ? 0 : found);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load video');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tryPlay = useCallback((reportBlocked: boolean) => {
    const el = videoRef.current;
    if (!el) return;
    el.play()
      .then(() => setAutoplayBlocked(false))
      .catch((err: unknown) => {
        if (reportBlocked && (err as { name?: string } | null)?.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        }
      });
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    const el = videoRef.current;
    if (el && !el.paused && !el.ended) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
    }
  }, []);

  const preloadNext = useCallback(() => {
    const entries = queue.map((v) => ({ id: v.id, playable: v.status === 'ok' }));
    const target = nextPlayableIndex(entries, idx, settings.repeatAll);
    if (target === null) return;
    if (preloadRef.current) {
      preloadRef.current.pause();
      preloadRef.current.removeAttribute('src');
      preloadRef.current = null;
    }
    const nv = document.createElement('video');
    nv.preload = 'metadata';
    nv.muted = true;
    nv.src = `/api/stream/${queue[target].id}`;
    preloadRef.current = nv;
    nv.load();
  }, [queue, idx, settings.repeatAll]);

  // Clean up the background preloader when the current video changes/unmounts.
  useEffect(() => {
    return () => {
      if (preloadRef.current) {
        preloadRef.current.pause();
        preloadRef.current.removeAttribute('src');
        preloadRef.current = null;
      }
    };
  }, [current?.id]);

  const navigateTo = useCallback((target: number, auto: boolean) => {
    setIdx(target);
    setEnded(false);
    setPlaybackError(null);
    setAutoplayBlocked(false);
    setBuffering(true);
    setCurrentTime(0);
    pendingPlayRef.current = true;
    autoRef.current = { advancing: auto, skips: 0 };
    if (preloadRef.current) {
      preloadRef.current.pause();
      preloadRef.current.removeAttribute('src');
      preloadRef.current = null;
    }
  }, []);

  const goNext = useCallback(
    (auto: boolean) => {
      const entries = queue.map((v) => ({ id: v.id, playable: v.status === 'ok' }));
      const target = nextPlayableIndex(entries, idx, settings.repeatAll);
      if (target === null) {
        if (auto) setEnded(true);
        return;
      }
      navigateTo(target, auto);
    },
    [queue, idx, settings.repeatAll, navigateTo],
  );

  const goPrev = useCallback(() => {
    const entries = queue.map((v) => ({ id: v.id, playable: v.status === 'ok' }));
    const target = prevPlayableIndex(entries, idx);
    if (target === null) return;
    navigateTo(target, false);
  }, [queue, idx, navigateTo]);

  const onVideoEnded = useCallback(() => {
    const action = onEnded({
      index: idx,
      length: queue.length,
      mode: settings.mode,
      repeatAll: settings.repeatAll,
    });
    if (action === 'restart') {
      const el = videoRef.current;
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => setAutoplayBlocked(true));
      }
      return;
    }
    if (action === 'advance') {
      goNext(true);
      return;
    }
    setEnded(true);
  }, [idx, queue.length, settings, goNext]);

  const onVideoError = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const code = el.error?.code ?? null;
    if (autoRef.current.advancing) {
      // A file failed during automatic advancement — skip on (bounded by
      // queue length, so deleted/unplayable files can never loop forever).
      autoRef.current.skips += 1;
      if (autoRef.current.skips >= queue.length) {
        autoRef.current.advancing = false;
        setPlaybackError('No playable videos left in the queue.');
        return;
      }
      const entries = queue.map((v) => ({ id: v.id, playable: v.status === 'ok' }));
      const target = nextPlayableIndex(entries, idx, settings.repeatAll);
      if (target === null) {
        autoRef.current.advancing = false;
        setPlaybackError('No more playable videos in the queue.');
        return;
      }
      navigateTo(target, true);
      return;
    }
    autoRef.current.advancing = false;
    setPlaybackError(mediaErrorMessage(code, current));
  }, [queue, idx, settings.repeatAll, navigateTo, current]);

  const retry = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPlaybackError(null);
    pendingPlayRef.current = true;
    el.load();
  }, []);

  const savePosition = useCallback(
    (t: number, d: number) => {
      if (!current) return;
      const key = `vlib.pos.${current.id}`;
      if (t < 3 || d - t < 5) localStorage.removeItem(key);
      else writeJson(localStorage, key, { t, d, savedAt: Date.now() });
    },
    [current],
  );

  // Video element events.
  const onLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    setBuffering(false);
    if (current) {
      const saved = readJson<{ t: number }>(localStorage, `vlib.pos.${current.id}`);
      if (saved && el.duration > 0 && saved.t > 5 && saved.t < el.duration - 5) {
        el.currentTime = saved.t;
        setCurrentTime(saved.t);
      }
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      tryPlay(true);
    }
    preloadNext();
  }, [current, tryPlay, preloadNext]);

  const onTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    const now = Date.now();
    if (now - lastPosSaveRef.current >= 3000 && el.duration > 0 && Number.isFinite(el.duration)) {
      lastPosSaveRef.current = now;
      savePosition(el.currentTime, el.duration);
    }
  }, [savePosition]);

  const onProgress = useCallback(() => {
    const el = videoRef.current;
    if (!el || el.buffered.length === 0) return;
    setBuffered(el.buffered.end(el.buffered.length - 1));
  }, []);

  const onPlay = useCallback(() => {
    setPlaying(true);
    setBuffering(false);
    setAutoplayBlocked(false);
    showControls();
  }, [showControls]);

  const onPause = useCallback(() => {
    setPlaying(false);
    showControls();
  }, [showControls]);

  const onWaiting = useCallback(() => setBuffering(true), []);
  const onCanPlay = useCallback(() => setBuffering(false), []);

  // Save the position when the page is hidden/closed.
  useEffect(() => {
    const save = () => {
      const el = videoRef.current;
      if (el && el.duration > 0 && Number.isFinite(el.duration)) savePosition(el.currentTime, el.duration);
    };
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [savePosition]);

  // Transport controls.
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.ended) el.currentTime = 0;
    if (el.paused) tryPlay(false);
    else el.pause();
  }, [tryPlay]);

  const seekBy = useCallback(
    (delta: number) => {
      const el = videoRef.current;
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
      el.currentTime = Math.min(Math.max(0, el.currentTime + delta), Math.max(0, el.duration - 0.1));
      showControls();
    },
    [showControls],
  );

  const applyVolume = useCallback((v: number, m: boolean) => {
    setVolume(v);
    setMuted(m);
    writeJson(localStorage, VOLUME_KEY, { v });
    const el = videoRef.current;
    if (el) {
      el.volume = v;
      el.muted = m;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (muted) applyVolume(Math.max(volume, 0.5), false);
    else applyVolume(volume, true);
  }, [muted, volume, applyVolume]);

  const adjustVolume = useCallback(
    (delta: number) => {
      const v = Math.min(1, Math.max(0, (muted ? 0 : volume) + delta));
      applyVolume(v, v === 0);
      showControls();
    },
    [muted, volume, applyVolume, showControls],
  );

  const onScrub = useCallback((t: number) => {
    setDragPos(t);
    const now = performance.now();
    if (now - lastScrubRef.current > 400 && videoRef.current) {
      lastScrubRef.current = now;
      videoRef.current.currentTime = t;
    }
  }, []);

  const onScrubEnd = useCallback(() => {
    const el = videoRef.current;
    if (el && dragPos !== null) el.currentTime = dragPos;
    setDragPos(null);
  }, [dragPos]);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void c.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Keyboard shortcuts (via ref so the listener never goes stale).
  const handlersRef = useRef({
    togglePlay,
    seekBy,
    adjustVolume,
    toggleMute,
    toggleFullscreen,
    goNext: () => goNext(false),
    goPrev,
  });
  useEffect(() => {
    handlersRef.current = {
      togglePlay,
      seekBy,
      adjustVolume,
      toggleMute,
      toggleFullscreen,
      goNext: () => goNext(false),
      goPrev,
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const h = handlersRef.current;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          h.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          h.seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          h.seekBy(5);
          break;
        case 'j':
        case 'J':
          h.seekBy(-10);
          break;
        case 'l':
        case 'L':
          h.seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          h.adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          h.adjustVolume(-0.1);
          break;
        case 'm':
        case 'M':
          h.toggleMute();
          break;
        case 'f':
        case 'F':
          h.toggleFullscreen();
          break;
        case 'n':
        case 'N':
          h.goNext();
          break;
        case 'p':
        case 'P':
          h.goPrev();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // All derived values are computed BEFORE any early return so the hook
  // count is identical on every render (otherwise React errors with #310:
  // "Rendered more hooks than during the previous render" — the first
  // render bails out at the `!current` guard, and the useMemo would only
  // run on the re-render that happens after the queue loads).
  const entries = useMemo(() => queue.map((v) => ({ id: v.id, playable: v.status === 'ok' })), [queue]);
  const nextIdx = nextPlayableIndex(entries, idx, settings.repeatAll);
  const nextTitle = nextIdx !== null ? queue[nextIdx]?.title ?? null : null;
  const prevExists = prevPlayableIndex(entries, idx) !== null;
  const showControlsCls = controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0';

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center">
        <AlertIcon className="h-8 w-8 text-red-400" />
        <p className="text-sm text-neutral-200">{loadError}</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Back to library
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <SpinnerIcon className="h-8 w-8 text-neutral-500" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onMouseMove={showControls}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) {
              el.volume = volume;
              el.muted = muted;
            }
          }}
          key={current.id}
          src={streamUrl ?? undefined}
          playsInline
          className="h-full w-full object-contain"
          onClick={() => togglePlay()}
          onDoubleClick={toggleFullscreen}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onProgress={onProgress}
          onPlay={onPlay}
          onPause={onPause}
          onWaiting={onWaiting}
          onCanPlay={onCanPlay}
          onEnded={onVideoEnded}
          onError={onVideoError}
        />

        {buffering && !playbackError && !autoplayBlocked && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <SpinnerIcon className="h-10 w-10 text-white/80" />
          </div>
        )}

        {autoplayBlocked && !playbackError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => tryPlay(false)}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/90 hover:bg-blue-500"
              aria-label="Play"
            >
              <PlayIcon className="h-7 w-7 text-white" />
            </button>
            <p className="text-xs text-neutral-400">Autoplay was blocked — click to play</p>
          </div>
        )}

        {ended && !playbackError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <button
              type="button"
              onClick={() => {
                const el = videoRef.current;
                if (el) {
                  el.currentTime = 0;
                  tryPlay(false);
                }
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label="Replay"
            >
              <ReplayIcon className="h-7 w-7 text-white" />
            </button>
            <p className="text-sm text-neutral-300">
              {settings.mode === 'repeat-one' ? 'Repeat One is on' : 'Playback ended'}
            </p>
            {settings.mode !== 'auto-next' && nextIdx !== null && (
              <button
                type="button"
                onClick={() => goNext(false)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                <SkipNextIcon className="h-4 w-4" />
                Play next: {nextTitle ?? '—'}
              </button>
            )}
          </div>
        )}

        {playbackError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-md rounded-xl bg-neutral-900 p-5 text-center">
              <AlertIcon className="mx-auto mb-3 h-8 w-8 text-red-400" />
              <p className="text-sm text-neutral-200">{playbackError}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
                >
                  <ReplayIcon className="h-4 w-4" /> Retry
                </button>
                <a
                  href={streamUrl ?? '#'}
                  download={`${current.title}${current.ext ? `.${current.ext}` : ''}`}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Back to library
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 py-3 transition-opacity duration-300 sm:px-5 ${showControlsCls}`}
      >
        <button
          type="button"
          onClick={() => router.push('/')}
          title="Back to library"
          className="rounded-full p-2 text-neutral-200 hover:bg-white/10"
        >
          <BackIcon className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{current.title}</p>
          {current.dir && <p className="truncate text-xs text-neutral-400">{current.dir}</p>}
        </div>
        <div className="ml-auto hidden text-right sm:block">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Next up</p>
          <p className="max-w-[260px] truncate text-sm">{nextTitle ?? '—'}</p>
        </div>
      </div>

      <div
        className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 sm:px-5 ${showControlsCls}`}
      >
        <Timeline
          duration={duration}
          value={dragPos ?? currentTime}
          buffered={buffered}
          disabled={duration <= 0}
          onScrub={onScrub}
          onScrubEnd={onScrubEnd}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!prevExists}
            title="Previous (P)"
            className="rounded-full p-2 text-neutral-200 hover:bg-white/10 disabled:opacity-40"
          >
            <SkipPrevIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => goNext(false)}
            disabled={nextIdx === null}
            title="Next (N)"
            className="rounded-full p-2 text-neutral-200 hover:bg-white/10 disabled:opacity-40"
          >
            <SkipNextIcon className="h-5 w-5" />
          </button>
          <span className="ml-1 text-xs tabular-nums text-neutral-300">
            {fmtDuration(dragPos ?? currentTime)}
            <span className="text-neutral-500"> / {fmtDuration(duration)}</span>
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center overflow-hidden rounded-lg border border-white/15">
              <button
                type="button"
                onClick={() =>
                  updateSettings({ mode: settings.mode === 'repeat-one' ? 'off' : 'repeat-one' })
                }
                title="Repeat One: replay this video when it ends"
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${
                  settings.mode === 'repeat-one' ? 'bg-blue-600/40 text-white' : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <RepeatOneIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Repeat One</span>
              </button>
              <div className="h-5 w-px bg-white/15" />
              <button
                type="button"
                onClick={() =>
                  updateSettings({ mode: settings.mode === 'auto-next' ? 'off' : 'auto-next' })
                }
                title="Automatic Next: play the next video automatically"
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${
                  settings.mode === 'auto-next' ? 'bg-blue-600/40 text-white' : 'text-neutral-300 hover:bg-white/10'
                }`}
              >
                <AutoNextIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Auto Next</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ repeatAll: !settings.repeatAll })}
              title="Repeat All: loop back to the start of the queue"
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs ${
                settings.repeatAll
                  ? 'border-blue-500 bg-blue-600/30 text-white'
                  : 'border-white/15 text-neutral-300 hover:bg-white/10'
              }`}
            >
              <RepeatAllIcon className="h-4 w-4" />
              <span className="hidden sm:inline">All</span>
            </button>
            <div className="ml-1 hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={toggleMute}
                title="Mute (M)"
                className="rounded-full p-2 text-neutral-200 hover:bg-white/10"
              >
                {muted || volume === 0 ? <VolumeMuteIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
              </button>
              <input
                type="range"
                className="vlib-volume w-20"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => applyVolume(Number(e.target.value), false)}
              />
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
              className="rounded-full p-2 text-neutral-200 hover:bg-white/10"
            >
              {isFullscreen ? <FullscreenExitIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}