// Imported first by server/index.ts so .env is loaded before anything reads
// process.env. On Cloud Run there is no .env; settings come from the service.
import { SITE_NAME, SITE_URL } from '../shared/site.js';

try {
  process.loadEnvFile();
} catch {
  // no .env file: fine
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set (copy .env.example to .env for local work)`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
const appUrl = (process.env.APP_URL ?? (isProduction ? SITE_URL : 'http://localhost:5173')).replace(/\/$/, '');

export const env = {
  port: Number(process.env.PORT ?? 8080),
  isProduction,
  databaseUrl: required('DATABASE_URL'),

  // Where sign-in links point. Production: the real site. Dev: the Vite server.
  appUrl,
  // Browsers' Origin header must be one of these for any request that changes data.
  allowedOrigins: new Set(
    [appUrl, SITE_URL, ...(process.env.EXTRA_ORIGINS ?? '').split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  ),

  // The first person to sign in with this email becomes the owner (only while there is no owner).
  ownerEmail: (process.env.OWNER_EMAIL ?? '').trim().toLowerCase() || null,

  // Email: without RESEND_API_KEY, emails are printed to the terminal instead of sent.
  resendApiKey: process.env.RESEND_API_KEY || null,

  // Photos: a Cloud Storage bucket in production; without it, a local .uploads/ folder.
  gcsBucket: process.env.GCS_BUCKET || null,

  // "Tidy this up" (milestone 11). Without a key the button simply doesn't show.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  // Safety net on top of the spending limit set in the Anthropic console.
  tidyPerDay: Number(process.env.TIDY_PER_DAY) || 200,
  emailFrom: process.env.EMAIL_FROM || `${SITE_NAME} <noreply@jmalerba.dev>`,
};
