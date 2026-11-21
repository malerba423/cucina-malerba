import type { RequestHandler } from 'express';

// Sent on every response.
// X-Robots-Tag keeps the site out of search results (decision: noindex).
// robots.txt stays open on purpose, so crawlers can actually see this header.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};
