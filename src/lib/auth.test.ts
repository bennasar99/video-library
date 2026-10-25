import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { guard } from './auth';

function reqWithCookie(cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/videos', { headers });
}

const COOKIE = 'vlib_auth';
const sha256 = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

describe('auth guard', () => {
  it('passes all requests through when AUTH_PASSWORD is unset', () => {
    vi.stubEnv('AUTH_PASSWORD', '');
    expect(guard(reqWithCookie())).toBeNull();
    expect(guard(reqWithCookie(`${COOKIE}=deadbeef`))).toBeNull();
  });

  it('rejects requests without a cookie when a password is set', () => {
    vi.stubEnv('AUTH_PASSWORD', 'hunter2');
    const denied = guard(reqWithCookie());
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(401);
  });

  it('accepts the cookie derived from the configured password', () => {
    vi.stubEnv('AUTH_PASSWORD', 'hunter2');
    expect(guard(reqWithCookie(`${COOKIE}=${sha256('hunter2')}`))).toBeNull();
  });

  it('rejects a cookie derived from a different password', () => {
    vi.stubEnv('AUTH_PASSWORD', 'hunter2');
    const denied = guard(reqWithCookie(`${COOKIE}=${sha256('other-password')}`));
    expect(denied!.status).toBe(401);
  });

  it('rejects malformed cookie values without throwing', () => {
    vi.stubEnv('AUTH_PASSWORD', 'hunter2');
    expect(guard(reqWithCookie(`${COOKIE}=%zz-not-hex`))!.status).toBe(401);
    expect(guard(reqWithCookie('vlib_auth=; other=x'))!.status).toBe(401);
  });
});
