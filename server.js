/**
 * Production server (`npm start`).
 *
 * Thin wrapper around next() that adds two things the plain `next start`
 * CLI cannot do from .env:
 *
 *   1. Honors HOST/PORT from the environment — a minimal .env loader below
 *      runs before anything else, so `PORT=8084` in .env just works.
 *
 *   2. Optional password gate (AUTH_PASSWORD). When a password is set,
 *      every request needs a valid `vlib_auth` cookie:
 *        - API routes answer 401 with an empty body of video information
 *        - page views redirect to /login
 *      The SAME cookie check is enforced inside every API route as well
 *      (src/lib/auth.ts), so no data route can leak anything even if this
 *      file is bypassed (e.g. `npx next start`). Keep both in sync.
 *
 * The session cookie value is SHA-256(AUTH_PASSWORD); changing the password
 * in .env therefore invalidates all existing sessions. Restart the server
 * after editing .env (the loader only runs at process start).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createServer } = require('node:http');
const next = require('next');

// --- minimal .env loader (real environment variables always win) ---------
function loadEnvFile(file) {
  let text;
  try {
    text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  } catch {
    return; // no .env file — rely on the real environment
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue; // blank line or comment
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnvFile('.env');

// --- configuration --------------------------------------------------------
const hostname = process.env.HOST || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '8080', 10);
const authPassword = process.env.AUTH_PASSWORD || '';

const COOKIE_NAME = 'vlib_auth';

function expectedToken() {
  return crypto.createHash('sha256').update(authPassword, 'utf8').digest('hex');
}

function cookieValue(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === COOKIE_NAME) return part.slice(i + 1).trim();
  }
  return null;
}

function isAuthorized(req) {
  if (!authPassword) return true; // password gate disabled
  const token = cookieValue(req);
  if (!token) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expectedToken(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Paths that may be reached without a valid cookie.
function isPublicPath(p) {
  if (p === '/login' || p === '/login/') return true;
  if (p === '/api/login' || p === '/api/logout') return true;
  if (p.startsWith('/_next/')) return true; // JS/CSS the login page needs
  if (p === '/favicon.ico') return true;
  return false;
}

const app = next({ dev: process.argv.includes('--dev') });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (!isAuthorized(req) && !isPublicPath(pathname)) {
      if (pathname.startsWith('/api/')) {
        // No video information — not even a "not found" hint — pre-auth.
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }
      res.statusCode = 302;
      res.setHeader('location', '/login');
      res.end();
      return;
    }
    handle(req, res);
  });

  server.listen(port, hostname, () => {
    console.log(
      `[server] listening on http://${hostname}:${port}` +
        (authPassword ? ' (password protection ON)' : ''),
    );
  });
});
