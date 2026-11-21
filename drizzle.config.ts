import { defineConfig } from 'drizzle-kit';

// Load .env for local runs; in CI, DATABASE_URL comes from the environment.
try {
  process.loadEnvFile();
} catch {
  // no .env file: fine
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (copy .env.example to .env for local work)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
