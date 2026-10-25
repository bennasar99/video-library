// @vitest-environment jsdom
/**
 * Regression test for React error #310 ("Rendered more hooks than during
 * the previous render"): VideoPlayer used to declare a `useMemo` AFTER the
 * early `!current` return. The first render (queue not loaded yet) bailed
 * out before that hook, then the fetch resolving added the hook on the
 * next render and crashed the whole page with "Application error" as soon
 * as a video was opened. Mounting the player and letting the data arrive
 * must therefore never throw a hook-order error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import VideoPlayer from '@/components/VideoPlayer';
import type { VideoInfo, VideosResponse } from '@/lib/types';

function video(id: number, title: string): VideoInfo {
  return {
    id,
    title,
    relPath: `${id}.mp4`,
    dir: '',
    ext: 'mp4',
    size: 1000,
    mtimeMs: 1700000000000,
    durationSec: 60,
    width: 1280,
    height: 720,
    videoCodec: 'h264',
    audioCodec: 'aac',
    hasAudio: true,
    status: 'ok',
    probeError: null,
    hasThumb: true,
    hasPreview: true,
    assetVersion: 'v1',
    addedAt: 1700000000000,
  };
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  root.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe('VideoPlayer', () => {
  it('re-renders without a hook-order error when the queue loads after mount', async () => {
    const detail = video(2, 'Second');
    const list = [video(1, 'First'), detail, video(3, 'Third')];

    // Gate the detail fetch so the first commit is guaranteed to happen in
    // the empty/`!current` state — exactly the browser scenario where the
    // page mounted, showed the spinner, and only later re-rendered with data.
    let resolveDetail: (v: Response) => void = () => {};
    const detailGate = new Promise<Response>((r) => (resolveDetail = r));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u === `/api/videos/${detail.id}`) return detailGate;
        if (u.startsWith('/api/videos?')) {
          const body: VideosResponse = {
            items: list,
            total: list.length,
            page: 1,
            pageSize: 100000,
            folders: [],
            dir: '',
            rootOk: true,
          };
          return jsonResponse(body);
        }
        if (u === '/api/settings') return jsonResponse({ mode: 'off', repeatAll: false });
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );

    // First render: detail fetch is still pending, so the component sits in
    // the `!current` spinner state (the render that used to run fewer hooks
    // than the one that followed).
    await act(async () => {
      root.render(<VideoPlayer id={2} />);
    });
    expect(host.querySelector('video')).toBeNull();

    // Let the fetches resolve. This re-render is the exact transition that
    // used to throw "Minified React error #310".
    await act(async () => {
      resolveDetail(jsonResponse(detail));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    const el = host.querySelector('video');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('src')).toBe('/api/stream/2');
  });

  it('shows the load error screen (and still keeps a stable hook order)', async () => {
    let resolveDetail: (v: Response) => void = () => {};
    const detailGate = new Promise<Response>((r) => (resolveDetail = r));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u === '/api/videos/2') return detailGate;
        if (u === '/api/settings') return jsonResponse({ mode: 'off', repeatAll: false });
        throw new Error(`unexpected fetch: ${u}`);
      }),
    );

    await act(async () => {
      root.render(<VideoPlayer id={2} />);
    });
    expect(host.querySelector('video')).toBeNull();
    expect(host.textContent ?? '').not.toContain('Video not found');

    await act(async () => {
      resolveDetail(
        new Response(JSON.stringify({ error: 'Video not found' }), { status: 404 }),
      );
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(host.querySelector('video')).toBeNull();
    expect(host.textContent ?? '').toContain('Video not found');
    expect(host.textContent ?? '').toContain('Back to library');
  });
});
