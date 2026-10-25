import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from './config';
import * as schema from '../db/schema';

/**
 * SQLite (better-sqlite3) connection + Drizzle ORM instance.
 *
 * A single connection is opened lazily and shared. better-sqlite3 is fully
 * synchronous, which keeps queries simple and fast for a self-hosted app.
 * Drizzle migrations are applied automatically on first access.
 */

let _db: BetterSQLite3Database<typeof schema> | null = null;
let _raw: Database.Database | null = null;

function getRawDb(): Database.Database {
  if (!_raw) {
    fs.mkdirSync(config.dataDir, { recursive: true });
    _raw = new Database(config.dbFile);
    _raw.pragma('journal_mode = WAL');
    _raw.pragma('synchronous = NORMAL');
    _raw.pragma('foreign_keys = ON');
  }
  return _raw;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) {
    const raw = getRawDb();
    _db = drizzle(raw, { schema });
    migrate(_db, {
      migrationsFolder: path.join(process.cwd(), 'drizzle'),
    });
  }
  return _db;
}

