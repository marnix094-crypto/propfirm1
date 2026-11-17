import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('brand-api'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool,
  MARKET_DATA_SOURCE: z.enum(['binance', 'simulated']).default('simulated'),
  QUOTE_STALE_MS: z.coerce.number().int().positive().default(10_000),
  DEMO_INITIAL_BALANCE_MINOR: z.coerce.bigint().default(10_000_000n),
  TERMS_VERSION: z.string().default('2026-11-draft'),
  RISK_LOOP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type AppConfig = Readonly<{
  env: 'development' | 'test' | 'production';
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string;
  jwt: { accessSecret: Uint8Array; issuer: string; accessTtlSec: number; refreshTtlDays: number };
  cookieSecure: boolean;
  marketDataSource: 'binance' | 'simulated';
  quoteStaleMs: number;
  demoInitialBalanceMinor: bigint;
  termsVersion: string;
  riskLoopEnabled: boolean;
}>;

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Validates env at boot and fails fast with a readable message. Secrets only come from env. */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && !e.COOKIE_SECURE)
    throw new Error('COOKIE_SECURE must be true in production');
  return {
    env: e.NODE_ENV,
    port: e.API_PORT,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    jwt: {
      accessSecret: new TextEncoder().encode(e.JWT_ACCESS_SECRET),
      issuer: e.JWT_ISSUER,
      accessTtlSec: e.ACCESS_TOKEN_TTL_SEC,
      refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    },
    cookieSecure: e.COOKIE_SECURE,
    marketDataSource: e.MARKET_DATA_SOURCE,
    quoteStaleMs: e.QUOTE_STALE_MS,
    demoInitialBalanceMinor: e.DEMO_INITIAL_BALANCE_MINOR,
    termsVersion: e.TERMS_VERSION,
    riskLoopEnabled: e.RISK_LOOP_ENABLED,
  };
}
