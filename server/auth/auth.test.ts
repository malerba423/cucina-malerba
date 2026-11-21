import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { clearSessionCookie, parseCookies, SESSION_COOKIE, sessionCookie } from './cookies.js';
import { hashToken, newToken } from './crypto.js';
import { createRateLimiter } from './rateLimit.js';
import { originCheck } from '../middleware/originCheck.js';

describe('cookies', () => {
  it('uses the one name Firebase Hosting forwards', () => {
    expect(SESSION_COOKIE).toBe('__session');
  });
  it('parses a Cookie header', () => {
    expect(parseCookies('a=1; __session=abc%2Fdef; b=2')).toEqual({ a: '1', __session: 'abc/def', b: '2' });
    expect(parseCookies(undefined)).toEqual({});
  });
  it('builds a locked-down session cookie', () => {
    const c = sessionCookie('tok', 60, true);
    expect(c).toContain('__session=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Secure');
    expect(sessionCookie('tok', 60, false)).not.toContain('Secure');
    expect(clearSessionCookie(true)).toContain('Max-Age=0');
  });
});

describe('tokens', () => {
  it('are long, random, and stored only as a hash', () => {
    const a = newToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});

describe('rate limiter', () => {
  it('allows up to the limit per window, then refuses', () => {
    const rl = createRateLimiter(2, 1000);
    expect(rl.take('x', 0)).toBe(true);
    expect(rl.take('x', 10)).toBe(true);
    expect(rl.take('x', 20)).toBe(false);
    expect(rl.take('y', 20)).toBe(true);
    expect(rl.take('x', 1500)).toBe(true);
  });
});

describe('originCheck', () => {
  const check = originCheck(new Set(['https://kitchen.jmalerba.dev']));
  const run = (method: string, origin?: string) => {
    const req = { method, get: (h: string) => (h.toLowerCase() === 'origin' ? origin : undefined) } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();
    check(req, res, next);
    return { next, res };
  };

  it('lets reads through', () => {
    expect(run('GET').next).toHaveBeenCalled();
  });
  it('lets writes from the site through', () => {
    expect(run('POST', 'https://kitchen.jmalerba.dev').next).toHaveBeenCalled();
  });
  it('blocks writes from elsewhere or with no Origin', () => {
    const other = run('POST', 'https://evil.example');
    expect(other.next).not.toHaveBeenCalled();
    expect(other.res.status).toHaveBeenCalledWith(403);
    expect(run('DELETE').next).not.toHaveBeenCalled();
  });
});
