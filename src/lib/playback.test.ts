import { describe, expect, it } from 'vitest';
import {
  nextIndex,
  nextPlayableIndex,
  onEnded,
  prevIndex,
  prevPlayableIndex,
  type QueueEntry,
} from './playback';

function entry(id: number, playable = true): QueueEntry {
  return { id, playable };
}

describe('onEnded', () => {
  it('stops for an empty queue in every mode', () => {
    for (const mode of ['off', 'repeat-one', 'auto-next'] as const) {
      expect(onEnded({ index: 0, length: 0, mode, repeatAll: false })).toBe('stop');
    }
  });

  it('stops in off mode', () => {
    expect(onEnded({ index: 0, length: 3, mode: 'off', repeatAll: true })).toBe('stop');
  });

  it('restarts in repeat-one mode', () => {
    expect(onEnded({ index: 0, length: 3, mode: 'repeat-one', repeatAll: false })).toBe('restart');
  });

  it('advances in auto-next mode when a next item exists', () => {
    expect(onEnded({ index: 0, length: 3, mode: 'auto-next', repeatAll: false })).toBe('advance');
  });

  it('stops in auto-next mode at the end without repeatAll', () => {
    expect(onEnded({ index: 2, length: 3, mode: 'auto-next', repeatAll: false })).toBe('stop');
  });

  it('advances (wraps) in auto-next mode at the end with repeatAll', () => {
    expect(onEnded({ index: 2, length: 3, mode: 'auto-next', repeatAll: true })).toBe('advance');
  });
});

describe('nextIndex / prevIndex', () => {
  it('nextIndex returns the following index', () => {
    expect(nextIndex({ index: 0, length: 3, mode: 'off', repeatAll: false })).toBe(1);
  });

  it('nextIndex returns null at the end without repeatAll', () => {
    expect(nextIndex({ index: 2, length: 3, mode: 'off', repeatAll: false })).toBeNull();
  });

  it('nextIndex wraps to 0 at the end with repeatAll', () => {
    expect(nextIndex({ index: 2, length: 3, mode: 'off', repeatAll: true })).toBe(0);
  });

  it('nextIndex is null for an empty queue', () => {
    expect(nextIndex({ index: 0, length: 0, mode: 'off', repeatAll: true })).toBeNull();
  });

  it('prevIndex returns the previous index', () => {
    expect(prevIndex({ index: 2, length: 3, mode: 'off', repeatAll: false })).toBe(1);
  });

  it('prevIndex is null at the start and for single-item queues', () => {
    expect(prevIndex({ index: 0, length: 3, mode: 'off', repeatAll: false })).toBeNull();
    expect(prevIndex({ index: 0, length: 1, mode: 'off', repeatAll: false })).toBeNull();
    expect(prevIndex({ index: 0, length: 0, mode: 'off', repeatAll: false })).toBeNull();
  });
});

describe('nextPlayableIndex', () => {
  const queue: QueueEntry[] = [entry(1, true), entry(2, false), entry(3, true)];

  it('skips unplayable entries forward', () => {
    expect(nextPlayableIndex(queue, 0, false)).toBe(2);
    expect(nextPlayableIndex(queue, 1, false)).toBe(2);
  });

  it('returns null when nothing playable follows (no wrap)', () => {
    expect(nextPlayableIndex(queue, 2, false)).toBeNull();
  });

  it('wraps to the front when wrap is enabled', () => {
    expect(nextPlayableIndex(queue, 2, true)).toBe(0);
  });

  it('never returns the current index itself, even when it is playable', () => {
    const only: QueueEntry[] = [entry(1, true), entry(2, false)];
    expect(nextPlayableIndex(only, 0, true)).toBeNull();
  });

  it('returns null when the whole queue is unplayable', () => {
    const bad: QueueEntry[] = [entry(1, false), entry(2, false), entry(3, false)];
    expect(nextPlayableIndex(bad, 0, true)).toBeNull();
    expect(nextPlayableIndex(bad, 1, false)).toBeNull();
  });

  it('returns null for an empty queue', () => {
    expect(nextPlayableIndex([], 0, true)).toBeNull();
  });

  it('normalizes a from index outside the queue bounds', () => {
    // base = ((from % len) + len) % len; search starts strictly after base.
    expect(nextPlayableIndex(queue, 3, false)).toBe(2); // base 0 -> 1(bad), 2(ok)
    expect(nextPlayableIndex(queue, 4, false)).toBe(2); // base 1 -> 2(ok)
    expect(nextPlayableIndex(queue, -1, false)).toBeNull(); // base 2 -> nothing after
  });
});

describe('prevPlayableIndex', () => {
  const queue: QueueEntry[] = [entry(1, true), entry(2, false), entry(3, true)];

  it('skips unplayable entries backward', () => {
    expect(prevPlayableIndex(queue, 2)).toBe(0);
  });

  it('returns null at the start of the queue (never wraps)', () => {
    expect(prevPlayableIndex(queue, 0)).toBeNull();
    // entry 0 is playable and sits before index 1
    expect(prevPlayableIndex(queue, 1)).toBe(0);
  });

  it('returns null for empty queues', () => {
    expect(prevPlayableIndex([], 0)).toBeNull();
  });
});