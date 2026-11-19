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
  DEV_TOOLS_ENABLED: bool,
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'FIELD_ENCRYPTION_KEY must be 32 random bytes, base64-encoded',
    ),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  SMTP_URL: z.string().url().optional(),
  MAIL_FROM: z.string().default('Daily Funded <no-reply@example.com>'),
  /** Where demo requests from the marketing site are sent (optional; otherwise only stored). */
  SALES_EMAIL: z.string().email().optional(),
  /** Payment provider. `fake` = test payments without real money (dev/test only). */
  PAYMENT_PROVIDER: z.enum(['fake']).default('fake'),
  /** Platform domain for automatic firm subdomains, e.g. dailyfunded.com → acme.dailyfunded.com (D95). */
  PLATFORM_BASE_DOMAIN: z
    .string()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
    .optional(),
  /** Hostname firms point their own domain to (CNAME). Default: tenants.<PLATFORM_BASE_DOMAIN>. */
  PLATFORM_CNAME_TARGET: z
    .string()
    .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
    .optional(),
  /** DNS lookups for own-domain verification: system resolver, or fake (tests). */
  DNS_RESOLVER: z.enum(['system', 'fake']).default('system'),
  /** Dedicated firm databases (D94): none = not offered, fake = tests, postgres = CREATE DATABASE. */
  DATABASE_PROVISIONER: z.enum(['none', 'fake', 'postgres']).default('none'),
  /** Connection with CREATEDB rights, used only to create dedicated firm databases. */
  DATABASE_ADMIN_URL: z.string().url().optional(),
  /**
   * shared = the multi-tenant platform + control plane (provisioning, routing registry);
   * dedicated = an instance serving one firm from its own database (D94).
   */
  INSTANCE_MODE: z.enum(['shared', 'dedicated']).default('shared'),
  /** Protects /internal/* (edge routing, TLS allow-list): sent as X-Internal-Token. */
  INTERNAL_API_TOKEN: z.string().min(24).optional(),
  /** Tenant used when a request names no firm (X-Firm header) and its host matches no domain. */
  DEFAULT_FIRM_SLUG: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default('daily-funded'),
  /** Admin panel requires two-step verification. Only `false` outside production (dev/e2e). */
  ADMIN_REQUIRE_2FA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Compete product (D97): operator used when a request names none and its host matches none. */
  COMPETE_DEFAULT_OPERATOR_SLUG: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default('your-arena'),
  /** Compete scheduler + drawdown loop (rounds open, start, settle). */
  COMPETE_LOOP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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
  /** Dev-only helpers (e.g. example funded account). Never enabled in production. */
  devToolsEnabled: boolean;
  fieldEncryptionKey: Buffer;
  appBaseUrl: string;
  smtpUrl: string | null;
  mailFrom: string;
  paymentProvider: 'fake';
  salesEmail: string | null;
  defaultFirmSlug: string;
  adminRequire2fa: boolean;
  compete: { defaultOperatorSlug: string; loopEnabled: boolean };
  platformBaseDomain: string | null;
  platformCnameTarget: string | null;
  dnsResolver: 'system' | 'fake';
  databaseProvisioner: 'none' | 'fake' | 'postgres';
  databaseAdminUrl: string | null;
  instanceMode: 'shared' | 'dedicated';
  internalApiToken: string | null;
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
  if (e.NODE_ENV === 'production' && e.DEV_TOOLS_ENABLED)
    throw new Error('DEV_TOOLS_ENABLED must be false in production');
  if (e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'fake')
    throw new Error('PAYMENT_PROVIDER=fake is not allowed in production');
  if (
    e.NODE_ENV === 'production' &&
    (e.DNS_RESOLVER === 'fake' || e.DATABASE_PROVISIONER === 'fake')
  )
    throw new Error('Fake DNS resolver / database provisioner are not allowed in production');
  if (e.NODE_ENV === 'production' && e.PLATFORM_BASE_DOMAIN && !e.INTERNAL_API_TOKEN)
    throw new Error(
      'INTERNAL_API_TOKEN is required in production when PLATFORM_BASE_DOMAIN is set',
    );
  if (e.DATABASE_PROVISIONER === 'postgres' && !e.DATABASE_ADMIN_URL)
    throw new Error('DATABASE_PROVISIONER=postgres needs DATABASE_ADMIN_URL');
  if (e.NODE_ENV === 'production' && !e.ADMIN_REQUIRE_2FA)
    throw new Error('ADMIN_REQUIRE_2FA must be true in production');
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
    devToolsEnabled: e.DEV_TOOLS_ENABLED,
    fieldEncryptionKey: Buffer.from(e.FIELD_ENCRYPTION_KEY, 'base64'),
    appBaseUrl: e.APP_BASE_URL.replace(/\/$/, ''),
    smtpUrl: e.SMTP_URL ?? null,
    mailFrom: e.MAIL_FROM,
    paymentProvider: e.PAYMENT_PROVIDER,
    salesEmail: e.SALES_EMAIL ?? null,
    defaultFirmSlug: e.DEFAULT_FIRM_SLUG,
    adminRequire2fa: e.ADMIN_REQUIRE_2FA,
    compete: {
      defaultOperatorSlug: e.COMPETE_DEFAULT_OPERATOR_SLUG,
      loopEnabled: e.COMPETE_LOOP_ENABLED,
    },
    platformBaseDomain: e.PLATFORM_BASE_DOMAIN ?? null,
    platformCnameTarget:
      e.PLATFORM_CNAME_TARGET ??
      (e.PLATFORM_BASE_DOMAIN ? `tenants.${e.PLATFORM_BASE_DOMAIN}` : null),
    dnsResolver: e.DNS_RESOLVER,
    databaseProvisioner: e.DATABASE_PROVISIONER,
    databaseAdminUrl: e.DATABASE_ADMIN_URL ?? null,
    instanceMode: e.INSTANCE_MODE,
    internalApiToken: e.INTERNAL_API_TOKEN ?? null,
  };
}
