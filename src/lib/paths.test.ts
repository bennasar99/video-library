import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeRelDir, resolveRelDir, resolveRelPath } from './paths';

const ROOT = path.resolve('/library');

describe('normalizeRelDir', () => {
  it('treats root variants as the empty path', () => {
    expect(normalizeRelDir('')).toBe('');
    expect(normalizeRelDir('  ')).toBe('');
    expect(normalizeRelDir('/')).toBe('');
    expect(normalizeRelDir('\\')).toBe('');
    expect(normalizeRelDir('///')).toBe('');
  });

  it('normalizes separators and trailing slashes', () => {
    expect(normalizeRelDir('Samples')).toBe('Samples');
    expect(normalizeRelDir('/Samples/')).toBe('Samples');
    expect(normalizeRelDir('Samples\\Nested')).toBe('Samples/Nested');
  });

  it('rejects traversal and empty segments', () => {
    expect(() => normalizeRelDir('..')).toThrow();
    expect(() => normalizeRelDir('Samples/../etc')).toThrow();
    expect(() => normalizeRelDir('Samples/./Nested')).toThrow();
    expect(() => normalizeRelDir('Samples//Nested')).toThrow();
  });
});

describe('resolveRelDir', () => {
  it('resolves the root without requiring a non-empty path', () => {
    expect(resolveRelDir(ROOT, '')).toBe(ROOT);
  });

  it('resolves nested folders inside the root', () => {
    expect(resolveRelDir(ROOT, 'Samples/Nested')).toBe(path.join(ROOT, 'Samples', 'Nested'));
  });

  it('never resolves outside the root', () => {
    expect(() => resolveRelPath(ROOT, '../secret')).toThrow();
    expect(() => resolveRelDir(ROOT, 'Samples/../../secret')).toThrow();
  });
});
