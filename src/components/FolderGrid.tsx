'use client';

import type { FolderInfo } from '@/lib/types';
import { GRID_CLASS } from './VideoGrid';
import { FolderIcon } from './icons';

interface Props {
  folders: FolderInfo[];
  onOpen: (path: string) => void;
}

/** Folder cards never show a preview — opening one navigates into it. */
export default function FolderGrid({ folders, onOpen }: Props) {
  return (
    <div className={GRID_CLASS}>
      {folders.map((folder) => (
        <button
          key={folder.path}
          type="button"
          onClick={() => onOpen(folder.path)}
          aria-label={`Open folder ${folder.name}`}
          className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 text-left transition hover:border-neutral-600"
        >
          <span className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-950">
            <FolderIcon className="h-10 w-10 text-amber-400 transition group-hover:scale-110" />
          </span>
          <span className="block p-2">
            <span className="block truncate text-sm font-medium" title={folder.name}>
              {folder.name}
            </span>
            <span className="block text-xs text-neutral-400">
              {folder.videoCount === 0
                ? 'Empty folder'
                : `${folder.videoCount} video${folder.videoCount === 1 ? '' : 's'}`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
