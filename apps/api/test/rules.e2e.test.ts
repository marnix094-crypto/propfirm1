import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { PrismaService } from '../src/infra/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { createTestApp, registerUser, waitFor, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let user: Awaited<ReturnType<typeof registerUser>>;
let funded: string;
let n = 0;

const btc = (bid: string, ask: string) => t.md.handleQuote('BTCUSDT', bid, ask, Date.now());
const auth = () => ({ Authorization: `Bearer ${user.token}` });
const order = (body: Record<string, unknown>) =>
  t
    .http()
    .post(`/api/v1/accounts/${funded}/orders`)
    .set(auth())
    .set('Idempotency-Key', `rk-${Date.now()}-${n++}`)
    .send({ clientOrderId: `r${Date.now()}${n++}`, symbol: 'BTCUSDT', leverage: 50, ...body });
const rules = async () => (await t.http().get(`/api/v1/accounts/${funded}/rules`).set(auth())).body;
const account = async () => (await t.http().get(`/api/v1/accounts/${funded}`).set(auth())).body;

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});
beforeEach(async () => {
  user = await registerUser(t);
  btc('60000.0', '60000.1');
  const res = await t.http().post('/api/v1/dev/example-funded-account').set(auth());
  expect(res.status).toBe(201);
  funded = res.body.id;
});

describe('funded account rules', () => {
  it('opens a $25,000 funded account with the example rule set and live meters', async () => {
    const acc = await account();
    expect(acc).toMatchObject({
      kind: 'FUNDED',
      status: 'FUNDED_ACTIVE',
      balanceMinor: '2500000',
      hasRules: true,
      maxLeverage: 50,
    });
    const r = await rules();
    expect(r.ruleSet).toMatchObject({
      code: 'INSTANT_EXAMPLE',
      version: 2,
      isExample: true,
      maxDailyLossBps: 300,
      maxDrawdownBps: 600,
    });
    const daily = r.rules.find((x: { rule: string }) => x.rule === 'DAILY_LOSS');
    const dd = r.rules.find((x: { rule: string }) => x.rule === 'MAX_DRAWDOWN');
    expect(daily).toMatchObject({
      limitMinor: '75000',
      floorEquityMinor: '2425000',
      state: 'safe',
    }); // 3% of $25k
    expect(dd).toMatchObject({ limitMinor: '150000', floorEquityMinor: '2350000', state: 'safe' }); // 6% trailing
  });

  it('counts trading days and raises the trailing floor with new equity highs', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.100' });
    expect(
      (await prisma.tradingAccount.findUnique({ where: { id: funded } }))!.tradingDaysCount,
    ).toBe(1);
    btc('61000.0', '61000.1'); // +$100 unrealized on 0.1 BTC
    await waitFor(async () => {
      const dd = (await rules()).rules.find((x: { rule: string }) => x.rule === 'MAX_DRAWDOWN');
      return BigInt(dd.floorEquityMinor) > 2_350_000n;
    });
  });

  it('breach: closes positions, cancels orders, fails the account and records it', async () => {
    const acct = io(`${t.url}/account`, {
      path: '/api/v1/ws',
      transports: ['websocket'],
      auth: { token: user.token },
    });
    const status = new Promise<{ data: { status: string; reason: string } }>((r) =>
      acct.on('account.status', r),
    );
    await acct.emitWithAck('subscribe', { accountId: funded });

    expect((await order({ side: 'BUY', type: 'MARKET', qty: '1.000' })).body.status).toBe('FILLED');
    expect(
      (await order({ side: 'SELL', type: 'LIMIT', qty: '0.100', limitPrice: '70000.0' })).body
        .status,
    ).toBe('OPEN');

    btc('59500.0', '59500.1'); // ≈ −$510: warning zone, not breached
    await waitFor(
      async () =>
        (await rules()).rules.find((x: { rule: string }) => x.rule === 'DAILY_LOSS').state ===
        'warn',
    );
    expect((await account()).status).toBe('FUNDED_ACTIVE');

    btc('59200.0', '59200.1'); // ≈ −$810 > $750 daily loss
    await waitFor(async () => (await account()).status === 'FAILED');
    const ev = await status;
    expect(ev.data).toEqual({ status: 'FAILED', reason: 'DAILY_LOSS' });
    acct.close();

    const acc = await account();
    expect(acc.failReason).toBe('DAILY_LOSS');
    expect((await t.http().get(`/api/v1/accounts/${funded}/positions`).set(auth())).body).toEqual(
      [],
    );
    const orders = await prisma.order.findMany({
      where: { accountId: funded },
      orderBy: { createdAt: 'asc' },
    });
    expect(orders.map((o) => `${o.source}:${o.status}`)).toEqual([
      'USER:FILLED',
      'USER:CANCELLED',
      'SYSTEM_BREACH:FILLED',
    ]);

    const v = await prisma.ruleViolation.findMany({ where: { accountId: funded } });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'DAILY_LOSS', floorMinor: 2_425_000n });
    const actions = (await prisma.auditLog.findMany({ where: { entityId: funded } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(['account.created', 'rule.breached', 'account.failed']),
    );
    expect((await t.app.get(AuditService).verify()).ok).toBe(true);

    // Risk alerts for the firm's admins: warning zone, the breach itself, the large closing loss.
    await waitFor(
      async () => (await prisma.riskAlert.count({ where: { accountId: funded } })) >= 3,
    );
    const alerts = await prisma.riskAlert.findMany({ where: { accountId: funded } });
    expect(alerts.map((a) => `${a.type}:${a.severity}`).sort()).toEqual([
      'BREACH:CRITICAL',
      'LARGE_LOSS:WARNING',
      'NEAR_BREACH:WARNING',
    ]);

    // A failed account cannot trade any more.
    const after = await order({ side: 'BUY', type: 'MARKET', qty: '0.010' });
    expect(after.status).toBe(422);
    expect(after.body.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect((await rules()).breach).toBe('DAILY_LOSS');
  });

  it('a breach is handled exactly once even with many ticks', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '1.000' });
    for (let i = 0; i < 20; i++) btc(`${58000 - i}.0`, `${58000 - i}.1`);
    await waitFor(async () => (await account()).status === 'FAILED');
    await new Promise((r) => setTimeout(r, 300));
    expect(await prisma.ruleViolation.count({ where: { accountId: funded } })).toBe(1);
    expect(
      await prisma.order.count({ where: { accountId: funded, source: 'SYSTEM_BREACH' } }),
    ).toBe(1);
  });

  it('rule sets are immutable in the database', async () => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "RuleSet" SET "maxDailyLossBps" = 9999`),
    ).rejects.toThrow(/append-only/);
  });

  it('demo accounts have no rules', async () => {
    const r = await t.http().get(`/api/v1/accounts/${user.accountId}/rules`).set(auth());
    expect(r.body).toMatchObject({ ruleSet: null, rules: [] });
  });

  it('exposes the client config', async () => {
    expect((await t.http().get('/api/v1/config')).body).toEqual({ devTools: true });
  });
});
