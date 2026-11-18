import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { CheckoutService } from '../src/modules/commerce/checkout.service.js';
import { createTestApp, registerUser, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
const key = () => `ck-${Date.now()}-${n++}`;

async function verifiedUser(overrides: Record<string, unknown> = {}) {
  const u = await registerUser(t, overrides);
  const token = tokenFrom(t.mail.last(u.email)!.text);
  expect((await t.http().post('/api/v1/auth/verify-email').send({ token })).status).toBe(204);
  return u;
}

async function product(slug = 'instant-25k') {
  const res = await t.http().get('/api/v1/products?type=INSTANT');
  return (res.body.items as { id: string; slug: string }[]).find((p) => p.slug === slug)!;
}

const checkout = (token: string, body: Record<string, unknown>, k = key()) =>
  t.http().post('/api/v1/checkout').set(bearer(token)).set('Idempotency-Key', k).send(body);

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

describe('catalogue', () => {
  it('lists the example instant products with their rules', async () => {
    const res = await t.http().get('/api/v1/products?type=INSTANT');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual([
      'instant-5k',
      'instant-10k',
      'instant-25k',
      'instant-50k',
      'instant-100k',
    ]);
    const p = res.body.items[2];
    expect(p).toMatchObject({
      accountSizeMinor: '2500000',
      priceMinor: '19900',
      priceCurrency: 'EUR',
      isRecommended: true,
      isExample: true,
      rules: { maxDrawdownBps: 600, profitSplitBps: 8000, payoutIntervalDays: 14 },
    });
    expect((await t.http().get(`/api/v1/products/${p.id}`)).body.slug).toBe('instant-25k');
  });

  it('quotes custom accounts on the server and validates input', async () => {
    const q = await t
      .http()
      .post('/api/v1/products/quote')
      .send({ type: 'INSTANT', accountSizeMinor: '3000000', maxDrawdownBps: 800 });
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ priceMinor: '26900', rules: { maxDrawdownBps: 800 } });
    const again = await t.http().get(`/api/v1/products/quotes/${q.body.quoteId}`);
    expect(again.body).toMatchObject({ quoteId: q.body.quoteId, priceMinor: '26900' });

    const bad = await t
      .http()
      .post('/api/v1/products/quote')
      .send({ type: 'INSTANT', accountSizeMinor: '3100000', maxDrawdownBps: 600 });
    expect(bad.body.code).toBe('ACCOUNT_SIZE_INVALID');
    const step = await t
      .http()
      .post('/api/v1/products/quote')
      .send({ type: 'TWO_STEP', accountSizeMinor: '3000000', maxDrawdownBps: 600 });
    expect(step.body.code).toBe('PRODUCT_TYPE_UNAVAILABLE');
  });

  it('payout feed is empty until real payouts exist', async () => {
    expect((await t.http().get('/api/v1/public/payouts-feed')).body).toEqual({ items: [] });
  });
});

describe('checkout', () => {
  it('requires a verified email, terms and an Idempotency-Key', async () => {
    const p = await product();
    const unverified = await registerUser(t);
    const r1 = await checkout(unverified.token, {
      productId: p.id,
      quantity: 1,
      acceptTerms: true,
    });
    expect(r1.status).toBe(403);
    expect(r1.body.code).toBe('EMAIL_NOT_VERIFIED');

    const u = await verifiedUser();
    const r2 = await checkout(u.token, { productId: p.id, quantity: 1, acceptTerms: false });
    expect(r2.status).toBe(400);
    const r3 = await t
      .http()
      .post('/api/v1/checkout')
      .set(bearer(u.token))
      .send({ productId: p.id, quantity: 1, acceptTerms: true });
    expect(r3.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('is idempotent per key and rejects key reuse with another body', async () => {
    const u = await verifiedUser();
    const p = await product();
    const k = key();
    const a = await checkout(u.token, { productId: p.id, quantity: 1, acceptTerms: true }, k);
    const b = await checkout(u.token, { productId: p.id, quantity: 1, acceptTerms: true }, k);
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    const c = await checkout(u.token, { productId: p.id, quantity: 2, acceptTerms: true }, k);
    expect(c.status).toBe(409);
    expect(c.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await prisma.purchase.count({ where: { user: { email: u.email } } })).toBe(1);
  });

  it('test payment creates funded accounts exactly once, with audit trail', async () => {
    const u = await verifiedUser({ locale: 'es' });
    const p = await product('instant-10k');
    const res = await checkout(u.token, { productId: p.id, quantity: 2, acceptTerms: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      totalMinor: '19800',
      isTestPayment: true,
      accountIds: [],
    });
    expect(res.body.paymentUrl).toBe(`http://localhost:5173/es/app/checkout/${res.body.id}/pay`);

    const paid = await t
      .http()
      .post(`/api/v1/checkout/${res.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'succeeded' });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('FULFILLED');
    expect(paid.body.paymentUrl).toBeNull();
    expect(paid.body.accountIds).toHaveLength(2);

    // Replayed event (same eventId) and a late "failed" event change nothing.
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: res.body.id } });
    const svc = t.app.get(CheckoutService);
    await svc.handleEvent({
      provider: 'fake',
      eventId: `test_${purchase.id}`,
      providerRef: purchase.providerRef!,
      type: 'payment.succeeded',
    });
    await svc.handleEvent({
      provider: 'fake',
      eventId: 'late-failure',
      providerRef: purchase.providerRef!,
      type: 'payment.failed',
    });
    const again = await t.http().get(`/api/v1/checkout/${res.body.id}`).set(bearer(u.token));
    expect(again.body.status).toBe('FULFILLED');
    expect(again.body.accountIds).toEqual(paid.body.accountIds);

    const accounts = (await t.http().get('/api/v1/accounts').set(bearer(u.token))).body as {
      id: string;
      kind: string;
      status: string;
      label: string;
      balanceMinor: string;
    }[];
    const funded = accounts.filter((a) => a.kind === 'FUNDED');
    expect(funded.map((a) => a.label).sort()).toEqual(['Instant $10K #1', 'Instant $10K #2']);
    expect(funded.every((a) => a.status === 'FUNDED_ACTIVE' && a.balanceMinor === '1000000')).toBe(
      true,
    );

    const actions = (
      await prisma.auditLog.findMany({ where: { entityId: purchase.id }, orderBy: { id: 'asc' } })
    ).map((a) => a.action);
    expect(actions).toEqual(['purchase.created', 'purchase.paid', 'purchase.fulfilled']);
    expect((await t.app.get(AuditService).verify()).ok).toBe(true);
  });

  it('failed payment creates no account; others cannot see the purchase', async () => {
    const u = await verifiedUser();
    const other = await verifiedUser();
    const p = await product();
    const res = await checkout(u.token, { productId: p.id, quantity: 1, acceptTerms: true });
    expect(
      (await t.http().get(`/api/v1/checkout/${res.body.id}`).set(bearer(other.token))).status,
    ).toBe(404);
    const failed = await t
      .http()
      .post(`/api/v1/checkout/${res.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'failed' });
    expect(failed.body).toMatchObject({ status: 'FAILED', failureCode: 'PAYMENT_FAILED' });
    expect(failed.body.accountIds).toEqual([]);
  });

  it('custom quote checkout; expired quotes are refused', async () => {
    const u = await verifiedUser();
    const q = (
      await t
        .http()
        .post('/api/v1/products/quote')
        .send({ type: 'INSTANT', accountSizeMinor: '3000000', maxDrawdownBps: 400 })
    ).body;
    const ok = await checkout(u.token, { quoteId: q.quoteId, quantity: 1, acceptTerms: true });
    expect(ok.body).toMatchObject({ totalMinor: q.priceMinor, rules: { maxDrawdownBps: 400 } });

    await prisma.priceQuote.update({
      where: { id: q.quoteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await checkout(u.token, { quoteId: q.quoteId, quantity: 1, acceptTerms: true });
    expect(expired.body.code).toBe('QUOTE_EXPIRED');
  });

  it('blocks restricted countries', async () => {
    const u = await verifiedUser();
    await prisma.user.update({ where: { email: u.email }, data: { country: 'IR' } });
    const res = await checkout(u.token, {
      productId: (await product()).id,
      quantity: 1,
      acceptTerms: true,
    });
    expect(res.body.code).toBe('COUNTRY_RESTRICTED');
  });
});

describe('funding progress', () => {
  it('reports profit split, payout conditions and scaling for a bought account', async () => {
    const u = await verifiedUser();
    const res = await checkout(u.token, {
      productId: (await product()).id,
      quantity: 1,
      acceptTerms: true,
    });
    const paid = await t
      .http()
      .post(`/api/v1/checkout/${res.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'succeeded' });
    const id = paid.body.accountIds[0];
    // Simulate closed profit of $1,000 and 3 trading days in this cycle.
    await prisma.tradingAccount.update({
      where: { id },
      data: { balanceMinor: 2_600_000n, cycleTradingDays: 3 },
    });
    const f = (await t.http().get(`/api/v1/accounts/${id}/funding`).set(bearer(u.token))).body;
    expect(f).toMatchObject({
      available: true,
      isExample: true,
      accountSizeMinor: '2500000',
      profitSplitBps: 8000,
      profitMinor: '100000',
      traderShareMinor: '80000',
      payout: { eligible: false, kycRequired: true },
      scaling: {
        profitMinor: '100000',
        targetMinor: '250000',
        requiredPayouts: 2,
        nextSizeMinor: '3125000',
        eligible: false,
      },
    });
    const byCode = Object.fromEntries(
      (f.payout.conditions as { code: string; met: boolean }[]).map((c) => [c.code, c.met]),
    );
    expect(byCode).toEqual({
      PAYOUT_INTERVAL: false,
      PAYOUT_TRADING_DAYS: true,
      PAYOUT_MIN_AMOUNT: true,
      PAYOUT_NO_OPEN_POSITIONS: true,
    });
  });

  it('is unavailable for the demo account', async () => {
    const u = await registerUser(t);
    const f = (await t.http().get(`/api/v1/accounts/${u.accountId}/funding`).set(bearer(u.token)))
      .body;
    expect(f).toMatchObject({ available: false, payout: null, scaling: null });
  });
});
