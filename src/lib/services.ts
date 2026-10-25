import fs from 'node:fs';
import { config } from './config';
import { getDb } from './database';
import { scanLibrary } from './catalog';
import { getScanState } from './scan-state';

/**
 * Server-side startup orchestration, invoked from src/instrumentation.ts
 * (runs exactly once for the Node.js runtime, not in the browser bundle).
 *
 *  - opens the SQLite database and applies migrations
 *  - creates the asset directories
 *  - runs an initial library scan in the background
 *  - schedules periodic incremental rescans
 */

const GLOBAL_KEY = '__vlib_services_started';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: boolean };

export function startServerServices(): void {
  const g = globalThis as GlobalShape;
  if (g[GLOBAL_KEY]) return;
  g[GLOBAL_KEY] = true;

  try {
    getDb(); // open + migrate
    fs.mkdirSync(config.assetsDir, { recursive: true });
    console.log('[services] ready — video root:', config.videoRoot, '| data dir:', config.dataDir);
  } catch (e) {
    console.error('[services] initialization failed:', e);
    return;
  }

  void runSafeScan('startup');

  if (config.rescanIntervalMs > 0) {
    const timer = setInterval(() => {
      void runSafeScan('interval');
    }, config.rescanIntervalMs);
    timer.unref?.();
  }
}

async function runSafeScan(source: string): Promise<void> {
  const scanState = getScanState();
  if (scanState.running) return;
  try {
    const result = await scanLibrary();
    console.log(`[services] ${source} scan done:`, result);
  } catch (e) {
    console.error(`[services] ${source} scan failed:`, e);
  }
}

/** Kick off a rescan. Returns 'already' when a scan is in progress. */
export function triggerRescan(full: boolean): Promise<unknown> | 'already' {
  if (getScanState().running) return 'already';
  return scanLibrary({ full });
}
