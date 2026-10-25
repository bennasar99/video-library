'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJSON, postJSON } from '@/lib/client-api';
import type {
  FolderInfo,
  ScanStatus,
  SortField,
  SortOrder,
  VideoInfo,
  VideosResponse,
} from '@/lib/types';
import FolderGrid from './FolderGrid';
import VideoGrid, { GRID_CLASS } from './VideoGrid';
import {
  AlertIcon,
  BackIcon,
  FilmIcon,
  OrderAscIcon,
  OrderDescIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  SpinnerIcon,
} from './icons';

const PAGE_SIZE = 24;
const QUEUE_KEY = 'vlib.queue';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Modified' },
  { value: 'duration', label: 'Duration' },
  { value: 'size', label: 'Size' },
  { value: 'added', label: 'Added' },
];

interface StoredQueue {
  items: VideoInfo[];
  savedAt: number;
}

function Breadcrumbs({ dir, onNavigate }: { dir: string; onNavigate: (path: string) => void }) {
  const parts = dir ? dir.split('/') : [];

  return (
    <nav aria-label="Folder" className="flex min-w-0 items-center gap-1 text-sm">
      {parts.length > 0 && (
        <button
          type="button"
          onClick={() => onNavigate(parts.slice(0, -1).join('/'))}
          title="Back"
          aria-label="Back to parent folder"
          className="mr-1 shrink-0 rounded p-1 text-neutral-300 hover:bg-neutral-800"
        >
          <BackIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onNavigate('')}
        className={
          parts.length === 0
            ? 'shrink-0 font-medium text-neutral-100'
            : 'shrink-0 text-blue-400 hover:underline'
        }
      >
        Library
      </button>
      {parts.map((part, i) => {
        const target = parts.slice(0, i + 1).join('/');
        const last = i === parts.length - 1;
        return (
          <span key={target} className="flex min-w-0 items-center gap-1">
            <span className="shrink-0 text-neutral-600">/</span>
            {last ? (
              <span className="truncate font-medium text-neutral-100">{part}</span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(target)}
                className="truncate text-blue-400 hover:underline"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function SkeletonGrid() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="aspect-video animate-pulse bg-neutral-800" />
          <div className="space-y-2 p-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-800" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-neutral-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Catalog() {
  const router = useRouter();

  const [items, setItems] = useState<VideoInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [rootOk, setRootOk] = useState<boolean | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortField>('name');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [dir, setDir] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reqSeq = useRef(0);
  const itemsRef = useRef<VideoInfo[]>([]);
  const pollTimerRef = useRef<number | null>(null);
  const wasBusyRef = useRef(false);

  const buildUrl = useCallback(
    (page: number, pageSize: number) => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      if (dir) p.set('dir', dir);
      p.set('sort', sort);
      p.set('order', order);
      p.set('page', String(page));
      p.set('pageSize', String(pageSize));
      return `/api/videos?${p.toString()}`;
    },
    [search, dir, sort, order, refreshKey],
  );

  const load = useCallback(
    async (page: number, append: boolean) => {
      const seq = ++reqSeq.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchJSON<VideosResponse>(buildUrl(page, PAGE_SIZE));
        if (seq !== reqSeq.current) return;
        itemsRef.current = append ? [...itemsRef.current, ...data.items] : data.items;
        setItems(itemsRef.current);
        setTotal(data.total);
        setFolders(data.folders);
        setRootOk(data.rootOk);
      } catch (e) {
        if (seq === reqSeq.current) {
          setError(e instanceof Error ? e.message : 'Failed to load videos');
        }
      } finally {
        if (seq === reqSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildUrl],
  );

  // Re-fetch whenever the filters (or a manual refresh) change.
  useEffect(() => {
    void load(1, false);
  }, [load]);

  // Debounced search.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const navigateDir = useCallback((next: string) => {
    setActiveId(null);
    setSearchInput('');
    setSearch('');
    setDir(next);
  }, []);

  // Background poller: shows scanning/generating progress and auto-refreshes
  // the grid once the server finishes a scan or asset batch.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await fetchJSON<ScanStatus>('/api/scan');
        if (cancelled) return;
        setScanStatus(st);
        const busy = st.running || st.generator.queued > 0 || st.generator.active > 0;
        if (wasBusyRef.current && !busy) setRefreshKey((k) => k + 1);
        wasBusyRef.current = busy;
      } catch {
        /* server not reachable yet — retry */
      }
      if (!cancelled) pollTimerRef.current = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    };
  }, []);

  const startRescan = useCallback(async (full: boolean) => {
    setActionError(null);
    try {
      await postJSON('/api/scan', { full });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not start rescan');
    }
  }, []);

  const startRegenerate = useCallback(async () => {
    setActionError(null);
    try {
      await postJSON('/api/regenerate', {});
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not start regeneration');
    }
  }, []);

  const openVideo = useCallback(
    async (id: number) => {
      setActiveId(null);
      let store: StoredQueue = { items: itemsRef.current.slice(0, 2000), savedAt: Date.now() };
      try {
        const data = await fetchJSON<VideosResponse>(buildUrl(1, 100000));
        store = { items: data.items.slice(0, 2000), savedAt: Date.now() };
      } catch {
        /* keep the currently loaded items as the queue */
      }
      try {
        sessionStorage.setItem(QUEUE_KEY, JSON.stringify(store));
      } catch {
        /* storage unavailable — player will build its own queue */
      }
      router.push(`/watch/${id}`);
    },
    [buildUrl, router],
  );

  const busyNow = Boolean(
    scanStatus && (scanStatus.running || scanStatus.generator.queued > 0 || scanStatus.generator.active > 0),
  );

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <FilmIcon className="h-6 w-6 shrink-0 text-blue-400" />
            <h1 className="text-lg font-semibold tracking-tight">Video Library</h1>
            {total > 0 && (
              <span className="text-sm text-neutral-500">
                {items.length} / {total} videos
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {busyNow && <SpinnerIcon className="h-4 w-4 text-blue-400" />}
              <button
                type="button"
                onClick={() => void startRescan(false)}
                disabled={busyNow}
                title="Rescan library (incremental)"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                <RefreshIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Rescan</span>
              </button>
              <button
                type="button"
                onClick={() => void startRescan(true)}
                disabled={busyNow}
                title="Full rescan (re-probe every file)"
                className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                Full
              </button>
              <button
                type="button"
                onClick={() => void startRegenerate()}
                disabled={busyNow}
                title="Regenerate all thumbnails & previews"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                <SparklesIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            </div>
          </div>

          <Breadcrumbs dir={dir} onNavigate={navigateDir} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={dir ? `Search in ${dir.split('/').pop()}…` : 'Search videos…'}
                aria-label="Search videos"
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-9 pr-3 text-sm placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortField)}
              aria-label="Sort by"
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
              title={order === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}
              aria-label="Toggle sort order"
              className="flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
            >
              {order === 'asc' ? <OrderAscIcon className="h-4 w-4" /> : <OrderDescIcon className="h-4 w-4" />}
            </button>
          </div>

          {busyNow && (
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <SpinnerIcon className="h-3.5 w-3.5" />
              {scanStatus?.running ? 'Scanning library…' : 'Generating thumbnails & previews…'}
              {scanStatus && scanStatus.generator.queued > 0 && (
                <span>{scanStatus.generator.queued} in queue</span>
              )}
            </div>
          )}
          {actionError && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertIcon className="h-3.5 w-3.5" />
              {actionError}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertIcon className="h-8 w-8 text-red-400" />
            <p className="text-sm text-neutral-300">{error}</p>
            <button
              type="button"
              onClick={() => void load(1, false)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Try again
            </button>
          </div>
        ) : rootOk === false ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertIcon className="h-8 w-8 text-amber-400" />
            <p className="max-w-md text-sm text-neutral-200">
              The video folder could not be found. Check <code className="rounded bg-neutral-800 px-1">VIDEO_ROOT</code>{' '}
              in <code className="rounded bg-neutral-800 px-1">.env</code> and restart the server.
            </p>
          </div>
        ) : items.length === 0 && (folders.length === 0 || search) ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FilmIcon className="h-10 w-10 text-neutral-600" />
            <p className="text-sm text-neutral-300">
              {busyNow
                ? 'Scanning your library…'
                : search
                  ? `No videos match “${search}” here.`
                  : dir
                    ? 'This folder is empty.'
                    : 'No videos found yet.'}
            </p>
            <p className="text-xs text-neutral-500">
              {dir
                ? 'Add videos to this folder on disk, then run a rescan.'
                : 'Add video files to the configured folder, then run a rescan.'}
            </p>
            <div className="flex gap-2">
              {dir && (
                <button
                  type="button"
                  onClick={() => navigateDir(dir.split('/').slice(0, -1).join('/'))}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => void startRescan(false)}
                disabled={busyNow}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Rescan library
              </button>
            </div>
          </div>
        ) : (
          <>
            {!search && folders.length > 0 && (
              <section className={items.length > 0 ? 'mb-6' : undefined}>
                {items.length > 0 && (
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Folders
                  </h2>
                )}
                <FolderGrid folders={folders} onOpen={navigateDir} />
              </section>
            )}
            {items.length > 0 && (
              <section>
                {!search && folders.length > 0 && (
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Videos
                  </h2>
                )}
                <VideoGrid
                  items={items}
                  activeId={activeId}
                  onActivate={setActiveId}
                  onDeactivate={() => setActiveId(null)}
                  onOpen={(vid) => void openVideo(vid)}
                />
              </section>
            )}
            {items.length < total && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void load(Math.floor(items.length / PAGE_SIZE) + 1, true)}
                  disabled={loadingMore}
                  className="flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loadingMore && <SpinnerIcon className="h-4 w-4" />}
                  {loadingMore ? 'Loading…' : `Load more (${total - items.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
