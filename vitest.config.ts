import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that file sets root to client/,
// which would make Vitest look for tests only there.
export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
