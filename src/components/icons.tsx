/**
 * Minimal inline SVG icon set (stroke-based, currentColor).
 * No external icon dependencies.
 */

interface IconProps {
  className?: string;
}

function base(className?: string) {
  return {
    className,
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export const PlayIcon = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const PauseIcon = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);

export const SkipNextIcon = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M6 6l8.5 6L6 18V6z" />
    <path d="M16 6h2v12h-2z" />
  </svg>
);

export const SkipPrevIcon = ({ className }: IconProps) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M18 6l-8.5 6L18 18V6z" />
    <path d="M6 6h2v12H6z" />
  </svg>
);

export const ReplayIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 12a9 9 0 1 0 2.64-6.36" />
    <path d="M3 4v5h5" />
  </svg>
);

/** Loop arrows with a "1" — Repeat One. */
export const RepeatOneIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    <path d="M11 10h2v6h-2z" />
  </svg>
);

/** Simple loop arrows — Repeat All. */
export const RepeatAllIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

/** List + play — Automatic Next. */
export const AutoNextIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M4 6h8" />
    <path d="M4 12h8" />
    <path d="M4 18h8" />
    <path d="M16 8l6 4-6 4z" fill="currentColor" stroke="none" />
  </svg>
);

export const VolumeIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

export const VolumeMuteIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
    <path d="m16 9 6 6" />
    <path d="m22 9-6 6" />
  </svg>
);

export const FullscreenIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
  </svg>
);

export const FullscreenExitIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 0 2-2h3" />
  </svg>
);

export const BackIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

export const SearchIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const RefreshIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const SparklesIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 15l.9 2.4L22 18l-2.1.6L19 21l-.9-2.4L16 18l2.1-.6z" />
  </svg>
);

export const FolderIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const FilmIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 3v18" />
    <path d="M17 3v18" />
    <path d="M3 8h4" />
    <path d="M3 16h4" />
    <path d="M17 8h4" />
    <path d="M17 16h4" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export const SpinnerIcon = ({ className }: IconProps) => (
  <svg {...base(className)} className={`animate-spin ${className ?? ''}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.56" />
  </svg>
);

export const OrderAscIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M11 5h8" />
    <path d="M11 9h5" />
    <path d="M11 13h2" />
    <path d="m6 18 3-3 3 3" />
    <path d="M9 15v6" />
  </svg>
);

export const OrderDescIcon = ({ className }: IconProps) => (
  <svg {...base(className)}>
    <path d="M11 5h2" />
    <path d="M11 9h5" />
    <path d="M11 13h8" />
    <path d="m6 15 3 3 3-3" />
    <path d="M9 18v-6" />
  </svg>
);
