import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
const lead = {
  name: 'Jane Founder',
  email: 'jane@firm.example',
  company: 'Acme Funding',
  website: 'https://acme.example',
  message: 'We want to launch in Q1.',
  volume: '100-1000',
  locale: 'en',
  consent: true,
};

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

describe('demo requests', () => {
  it('stores a lead with encrypted personal data', async () => {
    const res = await t.http().post('/api/v1/public/leads').send(lead);
    expect(res.status).toBe(204);
    const row = await prisma.lead.findFirst({ orderBy: { id: 'desc' } });
    expect(row?.volume).toBe('100-1000');
    expect(JSON.stringify(row)).not.toContain('jane@firm.example');
    expect(JSON.stringify(row)).not.toContain('Acme Funding');
  });

  it('requires consent and rejects filled honeypots', async () => {
    expect(
      (
        await t
          .http()
          .post('/api/v1/public/leads')
          .send({ ...lead, consent: false })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .http()
          .post('/api/v1/public/leads')
          .send({ ...lead, fax: 'x' })
      ).status,
    ).toBe(400);
    expect(
      (
        await t
          .http()
          .post('/api/v1/public/leads')
          .send({ ...lead, email: 'nope' })
      ).status,
    ).toBe(400);
  });
});
