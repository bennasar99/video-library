import type { ScanResult } from './types';

/**
 * In-memory scan status.
 *
 * Stored on globalThis so it survives Next.js dev-server hot reloads and
 * Next.js module registries (route handlers + instrumentation may run in
 * different module instances).
 */

export interface ScanState {
  running: boolean;
  rootOk: boolean | null;
  lastRunAt: number | null;
  lastResult: ScanResult | null;
  lastError: string | null;
}

const GLOBAL_KEY = '__vlib_scan_state';

type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: ScanState };

export function getScanState(): ScanState {
  const g = globalThis as GlobalShape;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      running: false,
      rootOk: null,
      lastRunAt: null,
      lastResult: null,
      lastError: null,
    };
  }
  return g[GLOBAL_KEY];
}
