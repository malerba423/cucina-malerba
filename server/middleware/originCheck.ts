import type { RequestHandler } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request forgery guard: any request that changes something must
 * come from a page on this site. Browsers always send Origin on such requests.
 * (The SameSite=Lax cookie already blocks most of this; this is the second lock.)
 */
export function originCheck(allowed: Set<string>): RequestHandler {
  return (req, res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && allowed.has(origin.replace(/\/$/, ''))) return next();
    res.status(403).json({ error: 'Request blocked: it did not come from this site' });
  };
}
