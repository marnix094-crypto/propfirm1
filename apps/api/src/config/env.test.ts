import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const c = loadConfig(base);
    expect(c.port).toBe(3000);
    expect(c.marketDataSource).toBe('simulated');
    expect(c.demoInitialBalanceMinor).toBe(10_000_000n);
    expect(c.corsOrigins).toEqual(['http://localhost:5173']);
  });
  it('rejects a missing or short JWT secret', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('requires secure cookies in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
  });
  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...base, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });
});
