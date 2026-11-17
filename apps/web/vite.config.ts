import { rmSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { defaultClientConditions, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Keep the MSW service worker out of builds that do not enable mocks (i.e. production). */
function stripMockWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-mock-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      if (process.env.VITE_ENABLE_MSW !== 'true') {
        rmSync(fileURLToPath(new URL(`./${outDir}/mockServiceWorker.js`, import.meta.url)), {
          force: true,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stripMockWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Workspace packages are consumed from TypeScript source.
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Absolute API base so Node's fetch works; MSW (node) intercepts it.
    env: { VITE_API_URL: 'http://localhost' },
  },
});
