import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import {
  MARKET_DATA_ADAPTER,
  MarketDataService,
} from '../src/modules/market-data/market-data.service.js';
import type { MarketDataAdapter } from '../src/modules/market-data/types.js';
import { MAILER, MemoryMailer } from '../src/modules/mail/mailer.js';

/** Feed that never ticks by itself; tests push quotes explicitly. */
export class StaticAdapter implements MarketDataAdapter {
  readonly source = 'static-test';
  async start(_s: string[], h: { onStatus: (s: 'connected') => void }) {
    h.onStatus('connected');
  }
  async stop() {}
  async getCandles() {
    return [];
  }
}

export interface TestApp {
  app: INestApplication;
  mail: MemoryMailer;
  md: MarketDataService;
  http: () => ReturnType<typeof request>;
  url: string;
}

export async function createTestApp(): Promise<TestApp> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
    MARKET_DATA_SOURCE: 'simulated',
    DEV_TOOLS_ENABLED: 'true',
    DNS_RESOLVER: 'fake',
    DATABASE_PROVISIONER: 'fake',
    PLATFORM_BASE_DOMAIN: 'dailyfunded.test',
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    APP_BASE_URL: 'http://localhost:5173',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  const mail = new MemoryMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MARKET_DATA_ADAPTER)
    .useValue(new StaticAdapter())
    .overrideProvider(MAILER)
    .useValue(mail)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, ['http://localhost:5173']);
  await app.listen(0);
  const url = await app.getUrl();
  return {
    app,
    mail,
    md: app.get(MarketDataService),
    http: () => request(app.getHttpServer()),
    url: url.replace('[::1]', 'localhost'),
  };
}

let counter = 0;
export const uniqueEmail = () => `t${Date.now()}${counter++}@example.com`;

export async function registerUser(t: TestApp, overrides: Record<string, unknown> = {}) {
  const email = uniqueEmail();
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({
      email,
      password: 'correct-horse-battery',
      country: 'NL',
      locale: 'nl',
      acceptTerms: true,
      ...overrides,
    });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.accessToken as string;
  const accounts = await t.http().get('/api/v1/accounts').set('Authorization', `Bearer ${token}`);
  const id = (
    JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }
  ).sub;
  return {
    id,
    email,
    token,
    accountId: accounts.body[0].id as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}

export const waitFor = async (fn: () => Promise<boolean> | boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor timed out');
};
