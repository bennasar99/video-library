/**
 * HTTP byte-range parsing (pure logic, unit-tested).
 * Implements the single-range subset of RFC 7233 that browsers use for
 * video seeking: "bytes=start-end", "bytes=start-", "bytes=-suffix".
 */

export interface RangeSpec {
  /** 200 = full file, 206 = partial content, 416 = unsatisfiable range. */
  status: 200 | 206 | 416;
  /** Inclusive start byte (0 for 416). */
  start: number;
  /** Inclusive end byte (-1 for 416 / empty file). */
  end: number;
}

export function parseRange(rangeHeader: string | null, size: number): RangeSpec {
  if (size === 0) {
    return rangeHeader ? { status: 416, start: 0, end: -1 } : { status: 200, start: 0, end: -1 };
  }

  if (!rangeHeader || !rangeHeader.toLowerCase().startsWith('bytes=')) {
    return { status: 200, start: 0, end: size - 1 };
  }

  // Only the first range is considered (single-range requests are what
  // HTML5 video players send).
  const single = rangeHeader.slice(6).split(',')[0].trim();
  const dash = single.indexOf('-');
  if (dash === -1) {
    return { status: 200, start: 0, end: size - 1 };
  }

  const startStr = single.slice(0, dash).trim();
  const endStr = single.slice(dash + 1).trim();

  if (startStr === '') {
    // Suffix range: the last N bytes.
    if (endStr === '') return { status: 200, start: 0, end: size - 1 };
    const n = Number.parseInt(endStr, 10);
    if (!Number.isFinite(n) || n <= 0) return { status: 200, start: 0, end: size - 1 };
    return { status: 206, start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number.parseInt(startStr, 10);
  if (!Number.isFinite(start) || start < 0 || start >= size) {
    return { status: 416, start: 0, end: size - 1 };
  }

  let end = size - 1;
  if (endStr !== '') {
    const e = Number.parseInt(endStr, 10);
    if (!Number.isFinite(e) || e < start) {
      return { status: 416, start: 0, end: size - 1 };
    }
    end = Math.min(e, size - 1);
  }

  return { status: 206, start, end };
}
