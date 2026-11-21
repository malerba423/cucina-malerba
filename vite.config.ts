import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app lives in client/. In dev, Vite serves it on :5173 and
// forwards /api to the Express server on :8080. In production, Express
// serves the built files from dist/client.
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
