import path from 'node:path';

/**
 * Path safety helpers. Every request that maps an identifier to a file must
 * re-validate that the resolved path stays inside the configured directory.
 * This prevents path traversal even if the database is tampered with.
 */

/** Returns true when `target` resolves to `base` itself or below it. */
export function isWithin(base: string, target: string): boolean {
  const b = path.resolve(base);
  const t = path.resolve(target);
  const prefix = b.endsWith(path.sep) ? b : b + path.sep;
  return t === b || t.startsWith(prefix);
}

/**
 * Returns the resolved absolute path when it is inside `base`,
 * otherwise throws. Always use this instead of raw path.join for media files.
 */
export function assertWithin(base: string, target: string): string {
  const t = path.resolve(target);
  if (!isWithin(base, t)) {
    throw new Error('Path escapes the configured directory');
  }
  return t;
}

/**
 * Resolve a catalog-relative path (forward slashes) under the video root.
 * Throws when the path would escape the root.
 */
export function resolveRelPath(base: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error('Invalid relative path');
  }
  const parts = relPath.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new Error('Invalid relative path');
    }
  }
  return assertWithin(base, path.join(base, ...parts));
}

/**
 * Normalize a user-supplied folder path to the catalog form: forward slashes,
 * no leading/trailing separators, and '' for the library root. Throws on
 * traversal or empty segments.
 */
export function normalizeRelDir(raw: string): string {
  const dir = raw.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (dir === '') return '';
  const parts = dir.split('/');
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new Error('Invalid folder path');
    }
  }
  return parts.join('/');
}

/** Resolve a normalized folder path ('' = VIDEO_ROOT) to an absolute path. */
export function resolveRelDir(base: string, relDir: string): string {
  return relDir === '' ? path.resolve(base) : resolveRelPath(base, relDir);
}
