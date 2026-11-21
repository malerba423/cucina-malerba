import { env } from './env.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { securityHeaders } from './middleware/securityHeaders.js';
import { healthRouter } from './routes/health.js';
import { pool } from './db/client.js';
import { SITE_NAME } from '../shared/site.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true); // Cloud Run sits behind Google's front end
app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));

// API
app.use('/api', healthRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

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
