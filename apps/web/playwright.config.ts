import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Real API with the simulated price feed (needs Postgres + Redis; see CI).
      command: 'pnpm --filter @brand/api start',
      cwd: '../..',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: '3000',
        MARKET_DATA_SOURCE: 'simulated',
        CORS_ORIGINS: 'http://localhost:4173',
        JWT_ACCESS_SECRET:
          process.env.JWT_ACCESS_SECRET ?? 'e2e-only-secret-e2e-only-secret-0123456789',
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://brand:change-me@localhost:5432/brand',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    },
    {
      // Test build: MSW only mocks the not-yet-built catalog endpoints (pricing, payout feed).
      command: 'VITE_ENABLE_MSW=true pnpm build && pnpm preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
