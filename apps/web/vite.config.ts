import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Where the dev server proxies /api requests. Defaults to the local API port.
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:3000';
  // Explicit, env-overridable dev port (default 5173). strictPort makes Vite
  // fail loudly on a conflict instead of silently picking another port — which
  // would send the frontend's API calls to the wrong place.
  const port = Number(env.VITE_PORT) || 5173;

  return {
    plugins: [react()],
    server: {
      port,
      strictPort: true,
      proxy: {
        // Frontend code calls /api/... (no hardcoded host); the dev server
        // forwards those to the backend, sidestepping CORS in development.
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@costing/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
  };
});
