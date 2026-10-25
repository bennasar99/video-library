'use client';

import { useEffect, useRef, useState } from 'react';
import { PLACEHOLDER_IMG } from '@/lib/placeholder';
import type { VideoInfo } from '@/lib/types';

/**
 * Card visual: a thumbnail image by default; when `active` (hover on
 * desktop / first tap on touch) it swaps to the short muted looping preview
 * clip. The preview URL is only attached while active, so preview files are
 * never downloaded for the whole grid — and at most ONE video element per
 * grid plays at any time (PREVIEW_CONCURRENCY = 1).
 */

export default function VideoPreview({ video, active }: { video: VideoInfo; active: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (active && video.hasPreview) {
      setVideoReady(false);
      setSrc(`/api/assets/preview/${video.id}?v=${encodeURIComponent(video.assetVersion ?? '')}`);
    } else {
      setSrc(null);
      setVideoReady(false);
    }
  }, [active, video.id, video.hasPreview, video.assetVersion]);

  // Start/stop playback whenever the active preview changes.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active || !src) return;
    el.muted = true;
    el.loop = true;
    el.play().catch(() => {
      /* muted autoplay should be allowed; ignore rejections */
    });
    return () => {
      el.pause();
    };
  }, [active, src]);

  const thumbUrl = `/api/assets/thumb/${video.id}?v=${encodeURIComponent(video.assetVersion ?? '')}`;
  const showImage = !videoReady;

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-neutral-800">
      {showImage && (
        <img
          src={video.hasThumb && !thumbFailed ? thumbUrl : PLACEHOLDER_IMG}
          alt={video.title}
          loading="lazy"
          decoding="async"
          onError={() => setThumbFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {src && (
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoReady(true)}
          onError={() => {
            // Preview not actually usable — fall back to the thumbnail.
            setSrc(null);
            setVideoReady(false);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
