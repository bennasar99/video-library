import crypto from 'node:crypto';
import { authSetCookieHeader } from '@/lib/auth';
import { jsonError, jsonOk } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/login — Body: { "password": "..." }.
 *
 * Compares the submitted password against AUTH_PASSWORD (timing-safe, via
 * SHA-256) and, on success, sets the httpOnly `vlib_auth` session cookie.
 * This endpoint is intentionally NOT guarded — it is the entry point.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { password?: unknown };
  try {
    body = (await req.json()) as { password?: unknown };
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }
  if (typeof body.password !== 'string') return jsonError(400, 'password is required');

  const expected = (process.env.AUTH_PASSWORD ?? '').trim();
  if (!expected) return jsonOk({ ok: true }); // gate disabled — nothing to check

  const a = crypto.createHash('sha256').update(body.password, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  if (!crypto.timingSafeEqual(a, b)) return jsonError(401, 'Wrong password');

  const res = jsonOk({ ok: true });
  res.headers.set('set-cookie', authSetCookieHeader());
  return res;
}
