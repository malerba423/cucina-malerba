import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

// Neon connection strings include ?sslmode=require, which pg picks up.
// Keep the pool small: Cloud Run may start a couple of instances, and the
// Neon free plan caps connections.
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle({ client: pool, schema });
