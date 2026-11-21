import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { SITE_NAME } from '../../shared/site.js';

export const healthRouter = Router();

// GET /api/health: is the server up, and can it reach the database?
// The hello-world page calls this to show that the whole stack works.
healthRouter.get('/health', async (_req, res) => {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    res.json({ ok: true, site: SITE_NAME, db: 'up', dbMs: Date.now() - started });
  } catch (err) {
    console.error('health check: database unreachable', err);
    res.status(503).json({ ok: false, site: SITE_NAME, db: 'down' });
  }
});
