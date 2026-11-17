import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../src/infra/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { TradingService } from '../src/modules/trading/trading.service.js';
import { createTestApp, registerUser, waitFor, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let user: Awaited<ReturnType<typeof registerUser>>;
let n = 0;

const btc = (bid: string, ask: string) => t.md.handleQuote('BTCUSDT', bid, ask, Date.now());
const auth = () => ({ Authorization: `Bearer ${user.token}` });
const order = (body: Record<string, unknown>, key = `key-${Date.now()}-${n++}`) =>
  t
    .http()
    .post(`/api/v1/accounts/${user.accountId}/orders`)
    .set(auth())
    .set('Idempotency-Key', key)
    .send({ clientOrderId: `c${Date.now()}${n++}`, symbol: 'BTCUSDT', leverage: 10, ...body });
const account = async () =>
  (await t.http().get(`/api/v1/accounts/${user.accountId}`).set(auth())).body;
const positions = async () =>
  (await t.http().get(`/api/v1/accounts/${user.accountId}/positions`).set(auth())).body;

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
});

describe('market orders', () => {
  it('fills at ask + spread + slippage, charges commission and opens a position', async () => {
    const res = await order({ side: 'BUY', type: 'MARKET', qty: '0.100' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'FILLED', filledQty: '0.100', side: 'BUY' });
    // 60000.1 + 1bp half-spread (6.0) + 1bp slippage (6.0) → 60012.1
    expect(res.body.avgFillPrice).toBe('60012.1');

    const acc = await account();
    expect(acc.balanceMinor).toBe(String(10_000_000 - 240)); // 4 bps of $6,001.21 = $2.40
    const [pos] = await positions();
    expect(pos).toMatchObject({
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: '0.100',
      avgEntryPrice: '60012.1',
      leverage: 10,
    });
    expect(pos.usedMarginMinor).toBe('60012'); // $6,001.21 / 10
    expect(pos.unrealizedPnlMinor).toBe('-121'); // marked at bid 60000.0
  });

  it('realizes PnL on close and keeps balance == sum of ledger entries', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.100' });
    btc('61000.0', '61000.1');
    const [pos] = await positions();
    const closed = await t
      .http()
      .post(`/api/v1/accounts/${user.accountId}/positions/${pos.id}/close`)
      .set(auth())
      .send({});
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('FILLED');
    expect(await positions()).toEqual([]);

    const ledger = await prisma.ledgerEntry.findMany({
      where: { accountId: user.accountId },
      orderBy: { id: 'asc' },
    });
    const sum = ledger.reduce((s, l) => s + l.amountMinor, 0n);
    const acc = await account();
    expect(BigInt(acc.balanceMinor)).toBe(sum);
    expect(ledger.map((l) => l.type)).toEqual([
      'INITIAL_CAPITAL',
      'COMMISSION',
      'REALIZED_PNL',
      'COMMISSION',
    ]);
    expect(BigInt(acc.balanceMinor)).toBeGreaterThan(10_000_000n); // +$1,000 move on 0.1 BTC minus costs
  });

  it('rejects with stable codes: margin, precision, stale data', async () => {
    const big = await order({ side: 'BUY', type: 'MARKET', qty: '100.000', leverage: 1 });
    expect(big.status).toBe(422);
    expect(big.body.code).toBe('INSUFFICIENT_MARGIN');

    const precise = await order({ side: 'BUY', type: 'MARKET', qty: '0.0001' });
    expect(precise.body.code).toBe('QTY_PRECISION');

    const lev = await order({ side: 'BUY', type: 'MARKET', qty: '0.001', leverage: 80 }); // demo cap 50
    expect(lev.body.code).toBe('LEVERAGE_INVALID');

    const eth = await t
      .http()
      .post(`/api/v1/accounts/${user.accountId}/orders`)
      .set(auth())
      .set('Idempotency-Key', `stale-${Date.now()}`)
      .send({
        clientOrderId: `s${Date.now()}`,
        symbol: 'ETHUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty: '0.010',
        leverage: 5,
      });
    expect(eth.status).toBe(422);
    expect(eth.body.code).toBe('MARKET_DATA_STALE');
  });
});

describe('idempotency', () => {
  it('returns the same order for a retried request and 409 for a reused key', async () => {
    const key = `idem-${Date.now()}`;
    const body = { clientOrderId: `idem${Date.now()}`, side: 'BUY', type: 'MARKET', qty: '0.010' };
    const a = await order(body, key);
    const b = await order(body, key);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(await prisma.order.count({ where: { accountId: user.accountId } })).toBe(1);

    const c = await order({ ...body, qty: '0.020' }, key);
    expect(c.status).toBe(409);
    expect(c.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const missing = await t
      .http()
      .post(`/api/v1/accounts/${user.accountId}/orders`)
      .set(auth())
      .send({ ...body, clientOrderId: 'nokey1', symbol: 'BTCUSDT', leverage: 10 });
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('pending orders and the matcher', () => {
  it('rests a limit order and fills it when the market reaches it', async () => {
    const res = await order({ side: 'BUY', type: 'LIMIT', qty: '0.010', limitPrice: '59000.0' });
    expect(res.body.status).toBe('OPEN');
    btc('58990.0', '58990.1');
    await waitFor(
      async () =>
        (await prisma.order.findUnique({ where: { id: res.body.id } }))?.status === 'FILLED',
    );
    const filled = await prisma.order.findUnique({ where: { id: res.body.id } });
    expect(filled!.avgFillPrice).toBeLessThanOrEqual(590000n);
  });

  it('triggers a stop order when the price crosses it', async () => {
    const res = await order({ side: 'BUY', type: 'STOP', qty: '0.010', stopPrice: '60500.0' });
    expect(res.body.status).toBe('OPEN');
    btc('60499.0', '60499.1');
    await new Promise((r) => setTimeout(r, 100));
    expect((await prisma.order.findUnique({ where: { id: res.body.id } }))!.status).toBe('OPEN');
    btc('60500.0', '60500.1');
    await waitFor(
      async () =>
        (await prisma.order.findUnique({ where: { id: res.body.id } }))?.status === 'FILLED',
    );
  });

  it('cancels an open order', async () => {
    const res = await order({ side: 'SELL', type: 'LIMIT', qty: '0.010', limitPrice: '65000.0' });
    const del = await t
      .http()
      .delete(`/api/v1/accounts/${user.accountId}/orders/${res.body.id}`)
      .set(auth());
    expect(del.body.status).toBe('CANCELLED');
    btc('66000.0', '66000.1');
    await new Promise((r) => setTimeout(r, 100));
    expect((await prisma.order.findUnique({ where: { id: res.body.id } }))!.status).toBe(
      'CANCELLED',
    );
  });

  it('closes a position when its stop loss is hit', async () => {
    await order({
      side: 'BUY',
      type: 'MARKET',
      qty: '0.010',
      slPrice: '59000.0',
      tpPrice: '62000.0',
    });
    const [pos] = await positions();
    expect(pos.slPrice).toBe('59000.0');
    btc('58999.0', '58999.1');
    await waitFor(async () => (await positions()).length === 0);
    const last = await prisma.order.findFirst({
      where: { accountId: user.accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(last!.source).toBe('SYSTEM_SL');
  });

  it('rejects stop loss / take profit on the wrong side', async () => {
    const res = await order({ side: 'BUY', type: 'MARKET', qty: '0.010', slPrice: '61000.0' });
    expect(res.body.code).toBe('SL_INVALID');
  });
});

describe('netting, isolation and consistency', () => {
  it('nets opposite orders into one position and flips', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.010' });
    await order({ side: 'SELL', type: 'MARKET', qty: '0.030' });
    const pos = await positions();
    expect(pos).toHaveLength(1);
    expect(pos[0]).toMatchObject({ side: 'SHORT', qty: '0.020' });
  });

  it('does not expose other users’ accounts', async () => {
    const other = await registerUser(t);
    const res = await t.http().get(`/api/v1/accounts/${other.accountId}`).set(auth());
    expect(res.status).toBe(404);
    const ord = await t
      .http()
      .post(`/api/v1/accounts/${other.accountId}/orders`)
      .set(auth())
      .set('Idempotency-Key', `x-${Date.now()}`)
      .send({
        clientOrderId: 'x1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        qty: '0.001',
        leverage: 1,
      });
    expect(ord.status).toBe(404);
  });

  it('stays consistent under 10 concurrent orders on one account', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => order({ side: 'BUY', type: 'MARKET', qty: '0.001' })),
    );
    expect(results.every((r) => r.status === 201 && r.body.status === 'FILLED')).toBe(true);
    const [pos] = await positions();
    expect(pos.qty).toBe('0.010');
    const ledger = await prisma.ledgerEntry.findMany({ where: { accountId: user.accountId } });
    const acc = await account();
    expect(BigInt(acc.balanceMinor)).toBe(ledger.reduce((s, l) => s + l.amountMinor, 0n));
  });

  it('settles funding: longs pay a positive rate', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.100' });
    const before = BigInt((await account()).balanceMinor);
    const inst = t.md.instrumentBySymbol('BTCUSDT');
    const trading = t.app.get(TradingService);
    const fundingTime = Date.now() + 1;
    await trading.settleFunding(inst.id, fundingTime, 600000n, 10_000n); // 0.01% at $60,000
    await trading.settleFunding(inst.id, fundingTime, 600000n, 10_000n); // same interval again → no double charge
    const after = BigInt((await account()).balanceMinor);
    expect(before - after).toBe(60n); // $0.60 on a $6,000 position
    const funding = await prisma.ledgerEntry.findMany({
      where: { accountId: user.accountId, type: 'FUNDING' },
    });
    expect(funding).toHaveLength(1);
  });

  it('resets a flat demo account to its initial balance', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.010' });
    const blocked = await t.http().post(`/api/v1/accounts/${user.accountId}/reset`).set(auth());
    expect(blocked.body.code).toBe('POSITIONS_OPEN');
    await t.http().post(`/api/v1/accounts/${user.accountId}/positions/close-all`).set(auth());
    const ok = await t.http().post(`/api/v1/accounts/${user.accountId}/reset`).set(auth());
    expect(ok.status).toBe(204);
    expect((await account()).balanceMinor).toBe('10000000');
  });
});

describe('audit log', () => {
  it('has an intact hash chain and cannot be modified', async () => {
    await order({ side: 'BUY', type: 'MARKET', qty: '0.010' });
    const audit = t.app.get(AuditService);
    const v = await audit.verify();
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(3);
    await expect(prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'x'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`)).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET "amountMinor" = 0`),
    ).rejects.toThrow(/append-only/);
  });
});

describe('websocket', () => {
  it('streams quotes and account events with increasing seq', async () => {
    const market: Socket = io(`${t.url}/market`, { path: '/api/v1/ws', transports: ['websocket'] });
    const acct: Socket = io(`${t.url}/account`, {
      path: '/api/v1/ws',
      transports: ['websocket'],
      auth: { token: user.token },
    });
    try {
      const sub = await market.emitWithAck('subscribe', { symbols: ['BTCUSDT', 'NOPE'] });
      expect(sub.symbols).toEqual(['BTCUSDT']);
      const quote = new Promise((r) => market.once('quote', r));
      await new Promise((r) => setTimeout(r, 300));
      btc('60100.0', '60100.1');
      expect(await quote).toMatchObject({ s: 'BTCUSDT', bid: '60100.0', ask: '60100.1' });

      const snap = await acct.emitWithAck('subscribe', { accountId: user.accountId });
      expect(snap.ok).toBe(true);
      expect(snap.account.balanceMinor).toBe('10000000');

      const seqs: number[] = [];
      acct.on('order.update', (e: { seq: string }) => seqs.push(Number(e.seq)));
      acct.on('fill', (e: { seq: string }) => seqs.push(Number(e.seq)));
      await order({ side: 'BUY', type: 'MARKET', qty: '0.010' });
      await waitFor(() => seqs.length >= 2);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
      expect(seqs[0]).toBeGreaterThan(Number(snap.seq));

      const denied = await acct.emitWithAck('subscribe', {
        accountId: '00000000-0000-7000-8000-000000000000',
      });
      expect(denied.ok).toBe(false);
    } finally {
      market.close();
      acct.close();
    }
  });

  it('disconnects sockets without a valid token', async () => {
    const s = io(`${t.url}/account`, {
      path: '/api/v1/ws',
      transports: ['websocket'],
      auth: { token: 'bad' },
    });
    await new Promise<void>((resolve) => s.on('disconnect', () => resolve()));
    s.close();
  });
});

describe('market tickers and watchlist', () => {
  it('returns 24h tickers for all instruments', async () => {
    const res = await t.http().get('/api/v1/market/tickers');
    expect(res.status).toBe(200);
    expect(res.body.map((x: { symbol: string }) => x.symbol)).toContain('BTCUSDT');
    const btcRow = res.body.find((x: { symbol: string }) => x.symbol === 'BTCUSDT');
    expect(btcRow.last).toBe('60000.0'); // mid of 60000.0/60000.1, half-even
  });

  it('stores a per-user watchlist and drops unknown symbols', async () => {
    const def = await t.http().get('/api/v1/me/watchlist').set(auth());
    expect(def.body.symbols).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    const put = await t
      .http()
      .put('/api/v1/me/watchlist')
      .set(auth())
      .send({ symbols: ['ETHUSDT', 'NOPEUSDT', 'ETHUSDT', 'BTCUSDT'] });
    expect(put.body.symbols).toEqual(['ETHUSDT', 'BTCUSDT']);
    expect((await t.http().get('/api/v1/me/watchlist').set(auth())).body.symbols).toEqual([
      'ETHUSDT',
      'BTCUSDT',
    ]);
  });
});
