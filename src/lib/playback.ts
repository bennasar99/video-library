/**
 * Pure playback-mode and queue logic (unit-tested).
 *
 * Two mutually exclusive playback modes:
 *   - 'repeat-one': when the video ends, replay the same video.
 *   - 'auto-next':  when the video ends, play the next item in the queue.
 * Plus an independent 'repeatAll' flag: when auto-next reaches the last
 * item, wrap around to the first instead of stopping.
 *
 * The helper functions never return the current index for "next" lookups,
 * which guarantees no infinite retry loop when files are missing.
 */

import type { PlaybackMode } from './types';

export interface QueueEntry {
  id: number;
  /** Whether the underlying file is expected to be playable. */
  playable: boolean;
}

export interface QueueState {
  index: number;
  length: number;
  mode: PlaybackMode;
  repeatAll: boolean;
}

/** What the player should do when the current video ends. */
export type EndedAction = 'restart' | 'advance' | 'stop';

export function onEnded(state: QueueState): EndedAction {
  if (state.length === 0) return 'stop';
  switch (state.mode) {
    case 'repeat-one':
      return 'restart';
    case 'auto-next':
      return nextIndex(state) !== null ? 'advance' : 'stop';
    default:
      return 'stop';
  }
}

/**
 * Index of the item that comes after the current one, respecting repeatAll
 * (wrap to 0 at the end) — or null when playback should stop.
 */
export function nextIndex(state: QueueState): number | null {
  if (state.length === 0) return null;
  const next = state.index + 1;
  if (next < state.length) return next;
  return state.repeatAll ? 0 : null;
}

/** Previous item index, or null when there is none (never wraps). */
export function prevIndex(state: QueueState): number | null {
  if (state.length <= 1) return null;
  return state.index > 0 ? state.index - 1 : null;
}

/**
 * Find the first playable entry STRICTLY AFTER `from`.
 * When `wrap` is true the search wraps around the end of the queue, but the
 * item at `from` itself is always excluded — so a call can never return the
 * video that just ended/failed, preventing infinite retry loops.
 * Returns null when nothing playable exists in the window.
 */
export function nextPlayableIndex(
  queue: QueueEntry[],
  from: number,
  wrap: boolean,
): number | null {
  const len = queue.length;
  if (len === 0) return null;
  const base = ((from % len) + len) % len;
  // Steps to try: from+1 .. len-1 (no wrap), or a full cycle minus `from`.
  const steps = wrap ? len - 1 : len - 1 - base;
  for (let i = 1; i <= steps; i++) {
    const idx = (base + i) % len;
    if (queue[idx].playable) return idx;
  }
  return null;
}

/**
 * Find the first playable entry STRICTLY BEFORE `from` (no wrap).
 * Returns null when there is nothing playable before `from`.
 */
export function prevPlayableIndex(queue: QueueEntry[], from: number): number | null {
  const len = queue.length;
  if (len === 0) return null;
  const base = ((from % len) + len) % len;
  for (let i = 1; i <= base; i++) {
    const idx = (base - i + len) % len;
    if (queue[idx].playable) return idx;
  }
  return null;
}
