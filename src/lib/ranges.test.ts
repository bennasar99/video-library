import { describe, expect, it } from 'vitest';
import { parseRange } from './ranges';

describe('parseRange', () => {
  const SIZE = 1000;

  it('returns the full file when there is no Range header', () => {
    expect(parseRange(null, SIZE)).toEqual({ status: 200, start: 0, end: SIZE - 1 });
  });

  it('returns the full file for a malformed (non-bytes) header', () => {
    expect(parseRange('items=0-5', SIZE)).toEqual({ status: 200, start: 0, end: SIZE - 1 });
  });

  it('returns the full file for a header without a dash', () => {
    expect(parseRange('bytes=50', SIZE)).toEqual({ status: 200, start: 0, end: SIZE - 1 });
  });

  it('handles an explicit start-end range', () => {
    expect(parseRange('bytes=0-99', SIZE)).toEqual({ status: 206, start: 0, end: 99 });
    expect(parseRange('bytes=100-199', SIZE)).toEqual({ status: 206, start: 100, end: 199 });
  });

  it('clamps an end past EOF to the last byte', () => {
    expect(parseRange('bytes=100-5000', SIZE)).toEqual({ status: 206, start: 100, end: SIZE - 1 });
  });

  it('handles an open-ended range (start-)', () => {
    expect(parseRange('bytes=100-', SIZE)).toEqual({ status: 206, start: 100, end: SIZE - 1 });
    expect(parseRange('bytes=999-', SIZE)).toEqual({ status: 206, start: 999, end: 999 });
  });

  it('handles a suffix range (-N)', () => {
    expect(parseRange('bytes=-500', SIZE)).toEqual({ status: 206, start: SIZE - 500, end: SIZE - 1 });
    expect(parseRange('bytes=-1', SIZE)).toEqual({ status: 206, start: SIZE - 1, end: SIZE - 1 });
  });

  it('caps a suffix larger than the file to the whole file', () => {
    expect(parseRange('bytes=-2000', SIZE)).toEqual({ status: 206, start: 0, end: SIZE - 1 });
  });

  it('treats a zero/invalid suffix as the full file', () => {
    expect(parseRange('bytes=-0', SIZE)).toEqual({ status: 200, start: 0, end: SIZE - 1 });
    expect(parseRange('bytes=-abc', SIZE)).toEqual({ status: 200, start: 0, end: SIZE - 1 });
  });

  it('returns 416 when the start is beyond EOF', () => {
    expect(parseRange('bytes=1000-', SIZE)).toEqual({ status: 416, start: 0, end: SIZE - 1 });
    expect(parseRange('bytes=1000-1500', SIZE)).toEqual({ status: 416, start: 0, end: SIZE - 1 });
  });

  it('returns 416 when the end is before the start', () => {
    expect(parseRange('bytes=500-100', SIZE)).toEqual({ status: 416, start: 0, end: SIZE - 1 });
  });

  it('only considers the first range of a multi-range header', () => {
    expect(parseRange('bytes=0-10, 100-200', SIZE)).toEqual({ status: 206, start: 0, end: 10 });
  });

  it('is case-insensitive on the unit', () => {
    expect(parseRange('BYTES=0-99', SIZE)).toEqual({ status: 206, start: 0, end: 99 });
    expect(parseRange('bytes= 0 - 99', SIZE)).toEqual({ status: 206, start: 0, end: 99 });
  });

  it('handles an empty file', () => {
    expect(parseRange(null, 0)).toEqual({ status: 200, start: 0, end: -1 });
    expect(parseRange('bytes=0-10', 0)).toEqual({ status: 416, start: 0, end: -1 });
  });
});