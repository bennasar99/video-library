/**
 * Runs once when the Node.js server starts (and again on restarts).
 * Kept free of top-level Node imports so it is safe in edge contexts.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServerServices } = await import('./lib/services');
    startServerServices();
  }
}
