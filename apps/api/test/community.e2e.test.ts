import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp, registerUser, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
const key = () => `ck-${Date.now()}-${n++}`;
const btc = (bid: string, ask: string) => t.md.handleQuote('BTCUSDT', bid, ask, Date.now());

async function fundedUser() {
  const u = await registerUser(t);
  await t
    .http()
    .post('/api/v1/auth/verify-email')
    .send({ token: tokenFrom(t.mail.last(u.email)!.text) });
  const product = (await t.http().get('/api/v1/products?type=INSTANT')).body.items[0];
  const c = await t
    .http()
    .post('/api/v1/checkout')
    .set(bearer(u.token))
    .set('Idempotency-Key', key())
    .send({ productId: product.id, quantity: 1, acceptTerms: true });
  const paid = await t
    .http()
    .post(`/api/v1/checkout/${c.body.id}/test-payment`)
    .set(bearer(u.token))
    .send({ outcome: 'succeeded' });
  return { ...u, funded: paid.body.accountIds[0] as string };
}

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  btc('60000.0', '60000.1');
});
afterAll(async () => {
  await t.app.close();
});

describe('leaderboard', () => {
  it('shows only opted-in traders by nickname; you see your own rank privately', async () => {
    const a = await fundedUser();
    const b = await fundedUser();
    const nick = `lime_${Date.now() % 100000}`;
    const p = await t
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(a.token))
      .send({ nickname: nick, leaderboardOptIn: true });
    expect(p.body).toEqual({ nickname: nick, leaderboardOptIn: true });
    const taken = await t
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(b.token))
      .send({ nickname: nick });
    expect(taken.body.code).toBe('NICKNAME_TAKEN');

    const lb = (await t.http().get('/api/v1/leaderboard').set(bearer(b.token))).body;
    expect(lb.rows.some((r: { name: string }) => r.name === nick)).toBe(true);
    expect(lb.rows.some((r: { isYou: boolean }) => r.isYou)).toBe(false);
    expect(lb.youArePublic).toBe(false);
    expect(lb.you).toMatchObject({ isYou: true, returnBps: 0 });
    expect(JSON.stringify(lb)).not.toContain('@example.com');
  });
});

describe('competitions', () => {
  it('joining opens one competition account; trading is blocked outside the window', async () => {
    const u = await registerUser(t);
    const list = (await t.http().get('/api/v1/competitions').set(bearer(u.token))).body.items;
    const monthly = list[0];
    expect(monthly).toMatchObject({ status: 'RUNNING', prize: null, yourAccountId: null });
    const joined = await t
      .http()
      .post(`/api/v1/competitions/${monthly.id}/join`)
      .set(bearer(u.token));
    expect(joined.body.yourAccountId).toBeTruthy();
    const again = await t
      .http()
      .post(`/api/v1/competitions/${monthly.id}/join`)
      .set(bearer(u.token));
    expect(again.body.yourAccountId).toBe(joined.body.yourAccountId);
    expect(joined.body.you).toMatchObject({ isYou: true, accountSizeMinor: '10000000' });

    const accountId = joined.body.yourAccountId;
    const order = () =>
      t
        .http()
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set(bearer(u.token))
        .set('Idempotency-Key', key())
        .send({
          clientOrderId: `c${Date.now()}${n++}`,
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'MARKET',
          qty: '0.010',
          leverage: 10,
        });
    expect((await order()).status).toBe(201);
    await prisma.competition.update({
      where: { id: monthly.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    const late = await order();
    expect(late.body.code).toBe('COMPETITION_NOT_ACTIVE');
    await prisma.competition.update({
      where: { id: monthly.id },
      data: { endsAt: new Date(monthly.endsAt) },
    });
  });
});

describe('transparency', () => {
  it('reports real counts publicly and no payouts before payouts exist', async () => {
    await fundedUser();
    const res = await t.http().get('/api/v1/public/transparency');
    expect(res.status).toBe(200);
    expect(res.body.fundedAccounts).toBeGreaterThan(0);
    expect(res.body).toMatchObject({ payouts: 0, payoutsTotalMinor: '0' });
  });
});
