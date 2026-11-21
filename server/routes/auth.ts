import { Router } from 'express';
import { looksLikeEmail, normalizeEmail, type MeResponse } from '../../shared/auth.js';
import { mayRequestLink, redeemLinkToken, sendSignInLink } from '../auth/accounts.js';
import { createRateLimiter } from '../auth/rateLimit.js';
import { endSession, startSession } from '../auth/session.js';

export const authRouter = Router();

const perIp = createRateLimiter(10, 15 * 60 * 1000);
const perEmail = createRateLimiter(3, 15 * 60 * 1000);
const verifyPerIp = createRateLimiter(20, 15 * 60 * 1000);

// GET /api/me: who is signed in (or null). The UI uses this to show or hide tools.
authRouter.get('/me', (_req, res) => {
  const body: MeResponse = { user: res.locals.user ?? null };
  res.json(body);
});

// POST /api/auth/request { email }
// Always answers the same way, so the page never reveals who is invited.
authRouter.post('/auth/request', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (!looksLikeEmail(email)) {
    res.status(400).json({ error: "That doesn't look like an email address" });
    return;
  }
  if (!perIp.take(req.ip ?? 'unknown') || !perEmail.take(email)) {
    res.status(429).json({ error: 'Too many requests. Wait a few minutes and try again.' });
    return;
  }

  const started = Date.now();
  if (await mayRequestLink(email)) {
    try {
      await sendSignInLink(email);
    } catch (err) {
      console.error('sign-in email failed', err);
    }
  }
  // Pad every answer to about the same duration, so response time doesn't
  // reveal whether an email was sent.
  const wait = 900 + Math.random() * 300 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  res.json({ ok: true });
});

// POST /api/auth/verify { token }: the "Finish signing in" button.
authRouter.post('/auth/verify', async (req, res) => {
  if (!verifyPerIp.take(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
    return;
  }
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const user = token ? await redeemLinkToken(token) : null;
  if (!user) {
    res.status(400).json({ error: 'This sign-in link has expired or was already used.' });
    return;
  }
  await startSession(req, res, user.id);
  const body: MeResponse = { user };
  res.json(body);
});

// POST /api/auth/signout
authRouter.post('/auth/signout', async (_req, res) => {
  await endSession(res);
  res.json({ ok: true });
});
