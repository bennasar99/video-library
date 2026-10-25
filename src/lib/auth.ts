import crypto from 'node:crypto';

/**
 * Optional password gate (enabled when AUTH_PASSWORD is set in .env).
 *
 * Auth state is stateless: the session cookie holds SHA-256(AUTH_PASSWORD)
 * (hex). Changing the password in .env therefore invalidates every existing
 * session. The production server (server.js) performs the same check at the
 * HTTP layer — redirecting unauthenticated page views to /login and answering
 * 401 for APIs — and the guard() below repeats it inside every data route, so
 * no video information can reach a client without the password even if the
 * server wrapper is bypassed (e.g. bare `npx next start` or `next dev`).
 */

const COOKIE_NAME = 'vlib_auth';
/** Sessions survive 30 days; changing AUTH_PASSWORD invalidates them. */
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return (process.env.AUTH_PASSWORD ?? '').trim().length > 0;
}

function expectedToken(): string {
  return crypto.createHash('sha256').update(process.env.AUTH_PASSWORD ?? '', 'utf8').digest('hex');
}

function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

export function isAuthorized(req: Request): boolean {
  if (!authEnabled()) return true;
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expectedToken(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Guard for API route handlers. Returns a 401 Response when the request is
 * not authorized, or null when it may proceed. Call it FIRST in every handler
 * so nothing — not even error details — is produced before authentication.
 */
export function guard(req: Request): Response | null {
  return isAuthorized(req)
    ? null
    : Response.json({ error: 'Authentication required' }, { status: 401 });
}

export function authSetCookieHeader(): string {
  return `${COOKIE_NAME}=${expectedToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}

export function authClearCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
