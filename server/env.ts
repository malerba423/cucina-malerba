// Imported first by server/index.ts so .env is loaded before anything reads
// process.env. On Cloud Run there is no .env; settings come from the service.
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

export const env = {
  port: Number(process.env.PORT ?? 8080),
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: required('DATABASE_URL'),
};
