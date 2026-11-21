import { env } from './env.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { securityHeaders } from './middleware/securityHeaders.js';
import { healthRouter } from './routes/health.js';
import { recipesRouter } from './routes/recipes.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { recipeWriteRouter } from './routes/recipeWrite.js';
import { importRouter } from './routes/import.js';
import { LOCAL_MEDIA_PATH, LOCAL_UPLOAD_DIR } from './storage.js';
import { loadUser } from './auth/session.js';
import { originCheck } from './middleware/originCheck.js';
import { pool } from './db/client.js';
import { SITE_NAME } from '../shared/site.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // Cloud Run sits behind Google's front end
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

// API
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); // never cache API answers (they can depend on who's signed in)
  next();
});
app.use('/api', originCheck(env.allowedOrigins));
app.use('/api', loadUser);
app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', recipesRouter);
app.use('/api', recipeWriteRouter);
app.use('/api', importRouter);
app.use('/api', adminRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
// Errors thrown in API handlers (Express 5 catches async ones) → JSON, not an HTML page.
app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Request errors (body too large, bad JSON) carry their own 4xx status: pass those on.
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? 'That upload is too large' : 'That request couldn’t be read' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

// Local photo uploads (only when no Cloud Storage bucket is configured).
if (!env.gcsBucket) app.use(LOCAL_MEDIA_PATH, express.static(LOCAL_UPLOAD_DIR, { maxAge: '1h' }));

// Built React app (production). In dev, Vite serves the client on :5173.
// Compiled, this file is dist/server/index.js, so the client is at dist/client.
// (Run from source with tsx, ../client is the source folder, which has no
// assets/ folder, so this block is skipped in dev.)
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
if (existsSync(path.join(clientDir, 'assets'))) {
  // Vite gives files under /assets hashed names, so they can be cached forever.
  app.use('/assets', express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(clientDir, { index: false }));
  // Any other GET is a page of the React app.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

const server = app.listen(env.port, () => {
  console.log(`${SITE_NAME} listening on :${env.port}`);
});

// Cloud Run sends SIGTERM before stopping an instance.
process.on('SIGTERM', () => {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
});
