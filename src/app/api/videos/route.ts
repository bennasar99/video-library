import fs from 'node:fs/promises';
import path from 'node:path';
import { and, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/database';
import { videos } from '@/db/schema';
import { config } from '@/lib/config';
import { escapeLike, jsonError, serializeVideo } from '@/lib/http';
import { guard } from '@/lib/auth';
import { normalizeRelDir, resolveRelDir } from '@/lib/paths';
import type { FolderInfo, SortField, SortOrder } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORT_FIELDS: SortField[] = ['name', 'duration', 'modified', 'size', 'added'];

function orderClause(field: SortField, order: SortOrder) {
  // Static SQL per (field, direction) pair — no user input in keywords.
  switch (field) {
    case 'name':
      return order === 'desc'
        ? sql`title COLLATE NOCASE DESC, rel_path COLLATE NOCASE DESC`
        : sql`title COLLATE NOCASE ASC, rel_path COLLATE NOCASE ASC`;
    case 'duration':
      // NULL durations always sort last.
      return order === 'desc'
        ? sql`duration_sec IS NULL, duration_sec DESC`
        : sql`duration_sec IS NULL, duration_sec ASC`;
    case 'modified':
      return order === 'desc' ? sql`mtime_ms DESC` : sql`mtime_ms ASC`;
    case 'size':
      return order === 'desc' ? sql`size DESC` : sql`size ASC`;
    case 'added':
    default:
      return order === 'desc' ? sql`added_at DESC, id DESC` : sql`added_at ASC, id ASC`;
  }
}

async function rootIsOk(): Promise<boolean> {
  return fs
    .stat(config.videoRoot)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

/**
 * List the subfolders of `dir` from the filesystem (so empty folders show up
 * too), with recursive video counts from the catalog.
 */
async function listFolders(dir: string): Promise<FolderInfo[]> {
  const absDir = resolveRelDir(config.videoRoot, dir);
  const dataDir = path.resolve(config.dataDir);
  if (absDir === dataDir || absDir.startsWith(dataDir + path.sep)) return [];

  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const paths = entries
    .filter((entry) => {
      if (!entry.isDirectory() || entry.name.startsWith('.')) return false;
      return path.resolve(absDir, entry.name) !== dataDir;
    })
    .map((entry) => (dir ? `${dir}/${entry.name}` : entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

  const counts = getDb()
    .select({ dir: videos.dir, count: sql<number>`count(*)` })
    .from(videos)
    .groupBy(videos.dir)
    .all();

  return paths.map((folder) => ({
    name: folder.slice(folder.lastIndexOf('/') + 1),
    path: folder,
    videoCount: counts.reduce(
      (sum, row) => (row.dir === folder || row.dir.startsWith(`${folder}/`) ? sum + row.count : sum),
      0,
    ),
  }));
}

export async function GET(req: Request): Promise<Response> {
  const denied = guard(req);
  if (denied) return denied;
  const url = new URL(req.url);

  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 100);
  let dir: string;
  try {
    dir = normalizeRelDir((url.searchParams.get('dir') ?? '').slice(0, 300));
  } catch {
    return jsonError(400, 'Invalid folder path');
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSizeParam = Number.parseInt(url.searchParams.get('pageSize') ?? '24', 10);
  const pageSize = Math.min(100_000, Math.max(1, Number.isFinite(pageSizeParam) ? pageSizeParam : 24));

  const rawSort = url.searchParams.get('sort') ?? 'name';
  const sort: SortField = SORT_FIELDS.includes(rawSort as SortField) ? (rawSort as SortField) : 'name';
  const order: SortOrder = url.searchParams.get('order') === 'desc' ? 'desc' : 'asc';

  const db = getDb();

  const conditions: SQL[] = [];
  if (search.length > 0) {
    // Search keeps the old behavior: all folders from the root, or the
    // current folder and everything below it.
    if (dir) {
      conditions.push(
        sql`(${videos.dir} = ${dir} OR ${videos.dir} LIKE ${escapeLike(dir) + '/%'} ESCAPE '\\')`,
      );
    }
    const like = `%${escapeLike(search)}%`;
    conditions.push(
      sql`(${videos.title} LIKE ${like} ESCAPE '\\' OR ${videos.relPath} LIKE ${like} ESCAPE '\\')`,
    );
  } else {
    // Browsing only shows videos directly inside the current folder; nested
    // folders are entered separately so the root never previews them.
    conditions.push(sql`${videos.dir} = ${dir}`);
  }
  const cond = conditions.length > 0 ? and(...conditions) : undefined;

  const total =
    db.select({ value: sql<number>`count(*)` }).from(videos).where(cond).get()?.value ?? 0;

  const items = db
    .select()
    .from(videos)
    .where(cond)
    .orderBy(orderClause(sort, order))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const rootOk = await rootIsOk();
  const folders = rootOk ? await listFolders(dir) : [];

  return Response.json({
    items: items.map(serializeVideo),
    total,
    page,
    pageSize,
    folders,
    dir,
    rootOk,
  });
}
