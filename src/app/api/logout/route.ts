import { authClearCookieHeader } from '@/lib/auth';
import { jsonOk } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/logout — clears the session cookie. */
export async function POST(): Promise<Response> {
  const res = jsonOk({ ok: true });
  res.headers.set('set-cookie', authClearCookieHeader());
  return res;
}
