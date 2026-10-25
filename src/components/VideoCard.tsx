'use client';

import { useState } from 'react';
import { fmtDuration, fmtSize } from '@/lib/client-api';
import type { VideoInfo } from '@/lib/types';
import VideoPreview from './VideoPreview';
import { AlertIcon, PlayIcon } from './icons';

/**
 * Detects touch devices (no hover) — on those, the first tap arms the card
 * (starts the preview) and a second tap (or the play button) opens the
 * player, matching standard mobile "hover preview" behavior without
 * accidental navigation.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

interface Props {
  video: VideoInfo;
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onOpen: () => void;
}

export default function VideoCard({ video, isActive, onActivate, onDeactivate, onOpen }: Props) {
  const [isTouch] = useState(isTouchDevice);

  const handleClick = () => {
    if (isTouch && !isActive) {
      onActivate(); // first tap: start preview
      return;
    }
    onOpen();
  };

  const metaParts = [
    fmtDuration(video.durationSec),
    video.size > 0 ? fmtSize(video.size) : null,
    video.width && video.height ? `${video.width}×${video.height}` : null,
    video.videoCodec ?? null,
  ].filter(Boolean) as string[];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => {
        if (!isTouch) onActivate();
      }}
      onMouseLeave={() => {
        if (!isTouch) onDeactivate();
      }}
      className={`group relative cursor-pointer select-none overflow-hidden rounded-xl border bg-neutral-900 transition ${
        isActive ? 'border-blue-500 ring-2 ring-blue-500/60' : 'border-neutral-800 hover:border-neutral-600'
      }`}
    >
      <div className="relative">
        <VideoPreview video={video} active={isActive} />

        {video.durationSec !== null && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {fmtDuration(video.durationSec)}
          </span>
        )}
        {video.status === 'error' && (
          <span
            title={video.probeError ?? 'Could not probe this file'}
            className="absolute right-1.5 top-1.5 rounded bg-red-600/90 p-1 text-white"
          >
            <AlertIcon className="h-4 w-4" />
          </span>
        )}

        {/* Explicit play affordance (required on touch devices) */}
        <button
          type="button"
          aria-label={`Play ${video.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-blue-600 ${
            isTouch ? 'opacity-90' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <PlayIcon className="ml-0.5 h-5 w-5" />
        </button>
      </div>

      <div className="p-2">
        <p className="truncate text-sm font-medium" title={video.title}>
          {video.title}
        </p>
        {metaParts.length > 0 && (
          <p className="truncate text-xs text-neutral-400">{metaParts.join(' • ')}</p>
        )}
        {video.dir && <p className="truncate text-[11px] text-neutral-500">{video.dir}</p>}
        {video.status === 'error' && (
          <p className="mt-0.5 truncate text-[11px] text-red-400" title={video.probeError ?? undefined}>
            {video.probeError ?? 'Playback error'}
          </p>
        )}
      </div>
    </div>
  );
}
