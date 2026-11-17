import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('uses defaults', () => {
    expect(loadConfig({})).toEqual({ port: 3000, corsOrigins: ['http://localhost:5173'] });
  });
  it('rejects invalid port', () => {
    expect(() => loadConfig({ API_PORT: 'abc' })).toThrow();
  });
});
