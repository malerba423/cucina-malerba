import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema.js';
import { env } from '../env.js';
import { hasRole, type Me, type Role } from '../../shared/auth.js';
import { clearSessionCookie, parseCookies, SESSION_COOKIE, sessionCookie } from './cookies.js';
import { hashToken, newToken } from './crypto.js';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 60;
const RENEW_WHEN_DAYS_LEFT = 30; // keep using the site and you stay signed in
const TOUCH_EVERY_MS = 10 * 60 * 1000; // don't write lastSeen on every request

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: Me;
      sessionTokenHash?: string;
    }
  }
}

/** Reads the session cookie and, when valid, puts the signed-in user on res.locals.user. */
export const loadUser: RequestHandler = async (req, res, next) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return next();

  const tokenHash = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now), isNull(users.removedAt)))
    .limit(1);

  if (!row) {
    res.append('Set-Cookie', clearSessionCookie(env.isProduction));
    return next();
  }

  res.locals.user = { id: row.id, email: row.email, name: row.name, role: row.role };
  res.locals.sessionTokenHash = tokenHash;

  const renew = row.expiresAt.getTime() - now.getTime() < RENEW_WHEN_DAYS_LEFT * DAY;
  if (renew || now.getTime() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    const expiresAt = renew ? new Date(now.getTime() + SESSION_DAYS * DAY) : row.expiresAt;
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.tokenHash, tokenHash));
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.id));
    if (renew) res.append('Set-Cookie', sessionCookie(token, SESSION_DAYS * 24 * 60 * 60, env.isProduction));
  }
  next();
};

export async function startSession(req: Request, res: Response, userId: number): Promise<void> {
  const token = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  });
  res.append('Set-Cookie', sessionCookie(token, SESSION_DAYS * 24 * 60 * 60, env.isProduction));
}

export async function endSession(res: Response): Promise<void> {
  if (res.locals.sessionTokenHash) await db.delete(sessions).where(eq(sessions.tokenHash, res.locals.sessionTokenHash));
  res.append('Set-Cookie', clearSessionCookie(env.isProduction));
}

/** Rejects the request unless someone is signed in with at least `minimum`. */
export function requireRole(minimum: Role): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    if (!user) {
      res.status(401).json({ error: 'Sign in first' });
      return;
    }
    if (!hasRole(user.role, minimum)) {
      res.status(403).json({ error: "You don't have permission to do that" });
      return;
    }
    next();
  };
}
