'use client';

import VideoCard from './VideoCard';
import type { VideoInfo } from '@/lib/types';

export const GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

interface Props {
  items: VideoInfo[];
  activeId: number | null;
  onActivate: (id: number) => void;
  onDeactivate: () => void;
  onOpen: (id: number) => void;
}

export default function VideoGrid({ items, activeId, onActivate, onDeactivate, onOpen }: Props) {
  return (
    <div className={GRID_CLASS}>
      {items.map((v) => (
        <VideoCard
          key={v.id}
          video={v}
          isActive={activeId === v.id}
          onActivate={() => onActivate(v.id)}
          onDeactivate={onDeactivate}
          onOpen={() => onOpen(v.id)}
        />
      ))}
    </div>
  );
}
