import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { CompeteAuditService } from '../src/modules/compete/compete-audit.service.js';
import { createTestApp, registerUser, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;
let startOffset = 1;

const btc = (bid: string, ask: string) => t.md.handleQuote('BTCUSDT', bid, ask, Date.now());
const key = () => `idem-${Date.now()}-${n++}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Player {
  id: string;
  token: string;
  nickname: string;
  email: string;
}

async function registerPlayer(
  operator?: string,
  overrides: Record<string, unknown> = {},
): Promise<Player> {
  const nickname = `p${Date.now() % 1e8}${n++}`;
  const email = uniqueEmail();
  const req = t.http().post('/api/v1/compete/auth/register');
  if (operator) req.set('X-Compete-Operator', operator);
  const res = await req.send({
    email,
    password: 'correct-horse-battery',
    nickname,
    country: 'NL',
    locale: 'en',
    acceptTerms: true,
    confirmAdult: true,
    ...overrides,
  });
  if (res.status !== 201)
    throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.player.id, token: res.body.accessToken, nickname, email };
}

const as = (p: Player) => ({ Authorization: `Bearer ${p.token}` });

/** Dev round that starts in ~1-2 s (each test uses its own start time). */
async function devRound(body: Record<string, unknown> = {}, operator?: string) {
  const req = t.http().post('/api/v1/compete/dev/rounds');
  if (operator) req.set('X-Compete-Operator', operator);
  const res = await req.send({
    startsInSec: startOffset++,
    durationSec: 600,
    minParticipants: 3,
    ...body,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; startsAt: string; endsAt: string };
}

async function joinAndPay(p: Player, roundId: string) {
  const join = await t
    .http()
    .post(`/api/v1/compete/rounds/${roundId}/entries`)
    .set(as(p))
    .set('Idempotency-Key', key());
  expect(join.status).toBe(201);
  expect(join.body.paymentUrl).toContain(`/pay/${join.body.entry.id}`);
  const pay = await t
    .http()
    .post(`/api/v1/compete/entries/${join.body.entry.id}/test-payment`)
    .set(as(p))
    .set('Idempotency-Key', key())
    .send({ outcome: 'succeeded' });
  expect(pay.status).toBe(200);
  expect(pay.body.status).toBe('ACTIVE');
  return join.body.entry.id as string;
}

const tick = (at?: string) =>
  t
    .http()
    .post('/api/v1/compete/dev/tick')
    .send(at ? { at } : {});
const order = (p: Player, entryId: string, body: Record<string, unknown>) =>
  t
    .http()
    .post(`/api/v1/compete/entries/${entryId}/orders`)
    .set(as(p))
    .set('Idempotency-Key', key())
    .send({ clientOrderId: `c${n++}`, symbol: 'BTCUSDT', ...body });

/** Waits until the round's start time has passed (real clock) and runs a tick. */
async function startRound(r: { startsAt: string }) {
  const wait = Date.parse(r.startsAt) - Date.now() + 50;
  if (wait > 0) await sleep(wait);
  btc('60000.0', '60000.1');
  expect((await tick()).status).toBe(201);
}

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  btc('60000.0', '60000.1');
});
afterAll(async () => {
  await t.app.close();
});

describe('compete: separation from the prop-firm platform', () => {
  it('compete tokens do not work on the platform API and vice versa', async () => {
    const p = await registerPlayer();
    expect((await t.http().get('/api/v1/accounts').set(as(p))).status).toBe(401);

    const trader = await registerUser(t);
    const res = await t
      .http()
      .get('/api/v1/compete/me')
      .set('Authorization', `Bearer ${trader.token}`);
    expect(res.status).toBe(401);
    expect((await t.http().get('/api/v1/compete/me').set(as(p))).body.nickname).toBe(p.nickname);
  });

  it('a platform e-mail is not a compete account (separate identities)', async () => {
    const trader = await registerUser(t);
    const login = await t
      .http()
      .post('/api/v1/compete/auth/login')
      .send({ email: trader.email, password: 'correct-horse-battery' });
    expect(login.status).toBe(401);
    // …and registering it creates a separate compete player.
    const p = await registerPlayer(undefined, { email: trader.email });
    expect(p.id).not.toBe(trader.id);
  });
});

describe('compete: players', () => {
  it('requires 18+ confirmation and a unique nickname', async () => {
    const res = await t.http().post('/api/v1/compete/auth/register').send({
      email: uniqueEmail(),
      password: 'correct-horse-battery',
      nickname: 'minor_player',
      country: 'NL',
      locale: 'en',
      acceptTerms: true,
      confirmAdult: false,
    });
    expect(res.status).toBe(400);
    const p = await registerPlayer();
    const dup = await t.http().post('/api/v1/compete/auth/register').send({
      email: uniqueEmail(),
      password: 'correct-horse-battery',
      nickname: p.nickname,
      country: 'NL',
      locale: 'en',
      acceptTerms: true,
      confirmAdult: true,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('NICKNAME_TAKEN');
  });

  it('refreshes via its own cookie', async () => {
    const res = await t
      .http()
      .post('/api/v1/compete/auth/login')
      .send({
        email: (await registerPlayer().then(async (p) => p)).email,
        password: 'correct-horse-battery',
      });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('compete_rt='),
    )!;
    expect(cookie).toContain('Path=/api/v1/compete/auth');
    const r = await t
      .http()
      .post('/api/v1/compete/auth/refresh')
      .set('Cookie', cookie.split(';')[0]!);
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
  });
});

describe('compete: round lifecycle', () => {
  it('defaults: $10 entry, $100k, 1:100, 10% drawdown, min 50, 80% pool 50/30/20', async () => {
    const op = await t.http().get('/api/v1/compete/operator');
    expect(op.body).toMatchObject({
      slug: 'your-arena',
      entryFeeMinor: '1000',
      startBalanceMinor: '10000000',
      leverage: 100,
      maxDrawdownBps: 1000,
      minParticipants: 50,
      prizePoolBps: 8000,
      prizeSplitBps: [5000, 3000, 2000],
      durationMinutes: 60,
      testPayments: true,
    });
    const current = await t.http().get('/api/v1/compete/rounds/current');
    expect(current.status).toBe(200);
    expect(current.body.status).toBe('OPEN');
  });

  it('one entry per round, trading only while live, top 3 share 80% of the pot', async () => {
    const round = await devRound();
    const [a, b, c] = [await registerPlayer(), await registerPlayer(), await registerPlayer()];
    const ea = await joinAndPay(a, round.id);
    const eb = await joinAndPay(b, round.id);
    const ec = await joinAndPay(c, round.id);

    const again = await t
      .http()
      .post(`/api/v1/compete/rounds/${round.id}/entries`)
      .set(as(a))
      .set('Idempotency-Key', key());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_ENTERED');

    const early = await order(a, ea, { side: 'BUY', qty: '1.000' });
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('ROUND_NOT_LIVE');

    await startRound(round);
    const live = await t.http().get(`/api/v1/compete/me/rounds/${round.id}`).set(as(a));
    expect(live.body).toMatchObject({ status: 'LIVE', participants: 3, potMinor: '3000' });
    expect(live.body.prizesMinor).toEqual(['1200', '720', '480']);

    expect((await order(a, ea, { side: 'BUY', qty: '1.000' })).status).toBe(201);
    expect((await order(b, eb, { side: 'SELL', qty: '1.000' })).status).toBe(201);
    // 1:100 → max notional ≈ $10M; 200 BTC (~$12M) is rejected.
    const tooBig = await order(c, ec, { side: 'BUY', qty: '200.000' });
    expect(tooBig.status).toBe(422);
    expect(tooBig.body.code).toBe('INSUFFICIENT_MARGIN');

    btc('61000.0', '61000.1');
    const board = await t
      .http()
      .get(`/api/v1/compete/me/rounds/${round.id}/leaderboard`)
      .set(as(a));
    expect(board.body.rows.map((r: { nickname: string }) => r.nickname)).toEqual([
      a.nickname,
      c.nickname,
      b.nickname,
    ]);
    expect(board.body.me).toMatchObject({ rank: 1, isMe: true, prizeMinor: '1200' });

    expect((await tick(round.endsAt)).status).toBe(201);
    const settled = await prisma.competeRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(settled).toMatchObject({ status: 'SETTLED', potMinor: 3000n, operatorShareMinor: 600n });
    const entries = await prisma.competeEntry.findMany({ where: { roundId: round.id } });
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get(ea)).toMatchObject({ status: 'FINISHED', rank: 1, prizeMinor: 1200n });
    expect(byId.get(ec)).toMatchObject({
      rank: 2,
      prizeMinor: 720n,
      finalEquityMinor: 10_000_000n,
    });
    expect(byId.get(eb)).toMatchObject({ rank: 3, prizeMinor: 480n });
    expect(await prisma.competePosition.count({ where: { entryId: { in: [ea, eb, ec] } } })).toBe(
      0,
    );
    const prizes = await prisma.competePayment.findMany({
      where: { entryId: { in: [ea, eb, ec] }, kind: 'PRIZE' },
    });
    expect(prizes.map((p) => p.amountMinor).sort()).toEqual([1200n, 480n, 720n].sort());
    expect(prizes.every((p) => p.status === 'AWAITING_PAYOUT')).toBe(true);

    const after = await order(a, ea, { side: 'BUY', qty: '0.010' });
    expect(after.status).toBe(422);
    const history = await t.http().get('/api/v1/compete/me/history').set(as(a));
    expect(history.body[0].entry).toMatchObject({ rank: 1, prizeMinor: '1200' });
  });

  it('cancels below the minimum of participants and refunds every entry', async () => {
    const round = await devRound({ minParticipants: 50 });
    const [a, b] = [await registerPlayer(), await registerPlayer()];
    const ea = await joinAndPay(a, round.id);
    const eb = await joinAndPay(b, round.id);
    await startRound(round);
    const r = await prisma.competeRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(r.status).toBe('CANCELLED');
    for (const id of [ea, eb]) {
      const e = await prisma.competeEntry.findUniqueOrThrow({ where: { id } });
      expect(e.status).toBe('REFUNDED');
      const refunds = await prisma.competePayment.findMany({
        where: { entryId: id, kind: 'REFUND' },
      });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ amountMinor: 1000n, status: 'SUCCEEDED' });
    }
  });

  it('ends an entry at the static 10% drawdown floor ($90,000)', async () => {
    const round = await devRound();
    const players = [await registerPlayer(), await registerPlayer(), await registerPlayer()];
    const entries = [];
    for (const p of players) entries.push(await joinAndPay(p, round.id));
    await startRound(round);
    const [p] = players;
    const e = entries[0]!;
    expect((await order(p!, e, { side: 'BUY', qty: '10.000' })).status).toBe(201);
    btc('58900.0', '58900.1'); // −$1,100 × 10 ≈ −$11,000 → below the floor
    const sweep = await t.app
      .get((await import('../src/modules/compete/compete.service.js')).CompeteService)
      .sweepDrawdown();
    expect(sweep).toBeGreaterThanOrEqual(1);
    const entry = await t.http().get(`/api/v1/compete/entries/${e}`).set(as(p!));
    expect(entry.body).toMatchObject({ status: 'BREACHED', positions: [], floorMinor: '9000000' });
    expect(BigInt(entry.body.equityMinor)).toBeLessThanOrEqual(9_000_000n);
    const orders = await t.http().get(`/api/v1/compete/entries/${e}/orders`).set(as(p!));
    expect(orders.body[0]).toMatchObject({ reason: 'DRAWDOWN', side: 'SELL', qty: '10.000' });
    const blocked = await order(p!, e, { side: 'BUY', qty: '0.010' });
    expect(blocked.body.code).toBe('ENTRY_NOT_ACTIVE');
    btc('60000.0', '60000.1');
  });

  it('refunds a payment that lands after registration closed', async () => {
    const round = await devRound();
    const p = await registerPlayer();
    const join = await t
      .http()
      .post(`/api/v1/compete/rounds/${round.id}/entries`)
      .set(as(p))
      .set('Idempotency-Key', key());
    expect(join.status).toBe(201);
    await sleep(Date.parse(round.startsAt) - Date.now() + 50);
    const lateJoin = await t
      .http()
      .post(`/api/v1/compete/rounds/${round.id}/entries`)
      .set(as(await registerPlayer()))
      .set('Idempotency-Key', key());
    expect(lateJoin.body.code).toBe('ROUND_CLOSED');
    const pay = await t
      .http()
      .post(`/api/v1/compete/entries/${join.body.entry.id}/test-payment`)
      .set(as(p))
      .set('Idempotency-Key', key())
      .send({ outcome: 'succeeded' });
    expect(pay.body.status).toBe('REFUNDED');
  });
});

describe('compete: operator isolation', () => {
  it("a player of one operator cannot see or join another operator's rounds", async () => {
    await prisma.competeOperator.upsert({
      where: { slug: 'nova-arena' },
      create: { slug: 'nova-arena', name: 'Nova Arena', primaryColor: '#F97316' },
      update: {},
    });
    const nova = await registerPlayer('nova-arena');
    const home = await registerPlayer();
    const homeRound = (await t.http().get('/api/v1/compete/rounds/current')).body;
    const novaRound = (
      await t.http().get('/api/v1/compete/rounds/current').set('X-Compete-Operator', 'nova-arena')
    ).body;
    expect(novaRound.id).not.toBe(homeRound.id);

    expect(
      (await t.http().get(`/api/v1/compete/me/rounds/${homeRound.id}`).set(as(nova))).status,
    ).toBe(404);
    const join = await t
      .http()
      .post(`/api/v1/compete/rounds/${homeRound.id}/entries`)
      .set(as(nova))
      .set('Idempotency-Key', key());
    expect(join.status).toBe(404);
    // Same e-mail, other operator → separate account; logging in at the wrong operator fails.
    const wrong = await t
      .http()
      .post('/api/v1/compete/auth/login')
      .send({ email: nova.email, password: 'correct-horse-battery' });
    expect(wrong.status).toBe(401);
    expect((await t.http().get('/api/v1/compete/me/round').set(as(home))).body.id).toBe(
      homeRound.id,
    );
  });

  it('keeps an intact, separate audit chain', async () => {
    const r = await t.app.get(CompeteAuditService).verify();
    expect(r.ok).toBe(true);
    expect(r.checked).toBeGreaterThan(10);
    const platformRows = await prisma.auditLog.count({
      where: { action: { startsWith: 'compete.' } },
    });
    expect(platformRows).toBe(0);
  });
});
