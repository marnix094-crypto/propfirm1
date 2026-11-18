import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CopierService } from '../src/modules/copier/copier.service.js';
import { createTestApp, registerUser, waitFor, type TestApp } from './app.js';

let t: TestApp;
let n = 0;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const btc = (bid: string, ask: string) => t.md.handleQuote('BTCUSDT', bid, ask, Date.now());

beforeAll(async () => {
  t = await createTestApp();
  btc('60000.0', '60000.1');
});
afterAll(async () => {
  await t.app.close();
});

describe('trade copier', () => {
  it('mirrors opens and closes at the chosen size and records the result', async () => {
    const u = await registerUser(t);
    const follower = (
      await t.http().post('/api/v1/dev/example-funded-account').set(bearer(u.token))
    ).body.id as string;
    const link = await t
      .http()
      .post('/api/v1/copier/links')
      .set(bearer(u.token))
      .send({ masterAccountId: u.accountId, followerAccountId: follower, multiplierBps: 5000 });
    expect(link.status).toBe(201);
    const reverse = await t
      .http()
      .post('/api/v1/copier/links')
      .set(bearer(u.token))
      .send({ masterAccountId: follower, followerAccountId: u.accountId, multiplierBps: 10000 });
    expect(reverse.body.code).toBe('COPIER_CONFLICT');

    const open = await t
      .http()
      .post(`/api/v1/accounts/${u.accountId}/orders`)
      .set(bearer(u.token))
      .set('Idempotency-Key', `cp-${Date.now()}-${n++}`)
      .send({
        clientOrderId: `m${Date.now()}`,
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty: '0.020',
        leverage: 10,
      });
    expect(open.body.status).toBe('FILLED');
    const copier = t.app.get(CopierService);
    const followerPositions = async () =>
      (await t.http().get(`/api/v1/accounts/${follower}/positions`).set(bearer(u.token))).body;
    await waitFor(async () => {
      await copier.idle();
      return (await followerPositions()).length === 1;
    });
    expect((await followerPositions())[0]).toMatchObject({ side: 'LONG', qty: '0.010' });

    const [masterPos] = (
      await t.http().get(`/api/v1/accounts/${u.accountId}/positions`).set(bearer(u.token))
    ).body;
    await t
      .http()
      .post(`/api/v1/accounts/${u.accountId}/positions/${masterPos.id}/close`)
      .set(bearer(u.token))
      .set('Idempotency-Key', `cp-${Date.now()}-${n++}`)
      .send({});
    await waitFor(async () => {
      await copier.idle();
      return (await followerPositions()).length === 0;
    });
    const overview = (await t.http().get('/api/v1/copier').set(bearer(u.token))).body;
    expect(overview.events.map((e: { status: string }) => e.status)).toEqual(['COPIED', 'COPIED']);

    const other = await registerUser(t);
    expect(
      (
        await t
          .http()
          .patch(`/api/v1/copier/links/${link.body.id}`)
          .set(bearer(other.token))
          .send({ active: false })
      ).status,
    ).toBe(404);
  });
});

describe('certificates', () => {
  it('lists certificates for bought funded accounts and verifies them publicly', async () => {
    const u = await registerUser(t);
    const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
    await t
      .http()
      .post('/api/v1/auth/verify-email')
      .send({ token: tokenFrom(t.mail.last(u.email)!.text) });
    expect((await t.http().get('/api/v1/certificates').set(bearer(u.token))).body.items).toEqual(
      [],
    );
    const product = (await t.http().get('/api/v1/products?type=INSTANT')).body.items[0];
    const c = await t
      .http()
      .post('/api/v1/checkout')
      .set(bearer(u.token))
      .set('Idempotency-Key', `cert-${Date.now()}`)
      .send({ productId: product.id, quantity: 1, acceptTerms: true });
    await t
      .http()
      .post(`/api/v1/checkout/${c.body.id}/test-payment`)
      .set(bearer(u.token))
      .send({ outcome: 'succeeded' });
    const list = (await t.http().get('/api/v1/certificates').set(bearer(u.token))).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'FUNDED', accountSizeMinor: product.accountSizeMinor });
    const pub = await t.http().get(`/api/v1/public/certificates/${list[0].id}`);
    expect(pub.body).toMatchObject({ id: list[0].id, simulated: true });
    expect(JSON.stringify(pub.body)).not.toContain(u.email);
  });
});
