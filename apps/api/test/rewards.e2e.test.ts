import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { createTestApp, registerUser, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
const key = () => `rk-${Date.now()}-${n++}`;

async function fundedUser() {
  const u = await registerUser(t);
  const token = tokenFrom(t.mail.last(u.email)!.text);
  await t.http().post('/api/v1/auth/verify-email').send({ token });
  const product = (await t.http().get('/api/v1/products?type=INSTANT')).body.items[0];
  const c = await t
    .http()
    .post('/api/v1/checkout')
    .set(bearer(u.token))
    .set('Idempotency-Key', key())
    .send({ productId: product.id, quantity: 1, acceptTerms: true });
  await t
    .http()
    .post(`/api/v1/checkout/${c.body.id}/test-payment`)
    .set(bearer(u.token))
    .send({ outcome: 'succeeded' });
  return { ...u, product };
}

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

describe('daily points', () => {
  it('awards points once for real activity', async () => {
    const u = await fundedUser();
    const first = (await t.http().get('/api/v1/points').set(bearer(u.token))).body;
    expect(first).toMatchObject({ balance: 300, earned: 300, spent: 0, isExample: true });
    expect(first.history.map((h: { reason: string }) => h.reason).sort()).toEqual([
      'EMAIL_VERIFIED',
      'FUNDED_ACCOUNT',
    ]);
    const again = (await t.http().get('/api/v1/points').set(bearer(u.token))).body;
    expect(again.balance).toBe(300);
  });

  it('redeems points for an offer code that discounts a checkout once', async () => {
    const u = await fundedUser();
    const k = key();
    const redeem = () =>
      t
        .http()
        .post('/api/v1/points/redeem')
        .set(bearer(u.token))
        .set('Idempotency-Key', k)
        .send({ rewardId: 'discount-5' });
    const offer = await redeem();
    expect(offer.status).toBe(201);
    expect(offer.body).toMatchObject({ discountBps: 500, status: 'AVAILABLE' });
    expect((await redeem()).body.id).toBe(offer.body.id); // idempotent
    expect((await t.http().get('/api/v1/points').set(bearer(u.token))).body.balance).toBe(0);
    const poor = await t
      .http()
      .post('/api/v1/points/redeem')
      .set(bearer(u.token))
      .set('Idempotency-Key', key())
      .send({ rewardId: 'discount-5' });
    expect(poor.body.code).toBe('POINTS_INSUFFICIENT');

    // A failed payment gives the code back; a paid one consumes it.
    const buy = () =>
      t.http().post('/api/v1/checkout').set(bearer(u.token)).set('Idempotency-Key', key()).send({
        productId: u.product.id,
        quantity: 2,
        acceptTerms: true,
        offerCode: offer.body.code,
      });
    const c1 = await buy();
    expect(c1.body).toMatchObject({
      totalMinor: String(
        BigInt(u.product.priceMinor) * 2n - (BigInt(u.product.priceMinor) * 2n * 500n) / 10_000n,
      ),
      offerCode: offer.body.code,
    });
    expect((await buy()).body.code).toBe('OFFER_USED');
    await t
      .http()
      .post(`/api/v1/checkout/${c1.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'failed' });
    const c2 = await buy();
    expect(c2.status).toBe(201);
    await t
      .http()
      .post(`/api/v1/checkout/${c2.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'succeeded' });
    const offers = (await t.http().get('/api/v1/offers').set(bearer(u.token))).body.items;
    expect(offers[0]).toMatchObject({ code: offer.body.code, status: 'USED' });

    const other = await registerUser(t);
    const token = tokenFrom(t.mail.last(other.email)!.text);
    await t.http().post('/api/v1/auth/verify-email').send({ token });
    const stolen = await t
      .http()
      .post('/api/v1/checkout')
      .set(bearer(other.token))
      .set('Idempotency-Key', key())
      .send({
        productId: u.product.id,
        quantity: 1,
        acceptTerms: true,
        offerCode: offer.body.code,
      });
    expect(stolen.body.code).toBe('OFFER_INVALID');
  });

  it('points ledger rows cannot be changed', async () => {
    const u = await fundedUser();
    await t.http().get('/api/v1/points').set(bearer(u.token));
    await expect(
      prisma.pointsEntry.updateMany({
        where: { reason: 'EMAIL_VERIFIED' },
        data: { amount: 9999 },
      }),
    ).rejects.toThrow();
  });
});
