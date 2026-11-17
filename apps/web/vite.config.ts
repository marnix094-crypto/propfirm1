import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { defaultClientConditions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Workspace packages are consumed from TypeScript source.
    conditions: ['source', ...defaultClientConditions],
  },
  server: { port: Number(process.env.WEB_PORT ?? 5173) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
