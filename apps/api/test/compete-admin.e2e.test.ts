import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { totp } from '../src/modules/security/totp.js';
import { createTestApp, registerUser, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;
const API = '/api/v1/compete';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });

interface Admin {
  token: string;
  secret: string;
  email: string;
}

/** Dev staff → login → 2FA setup + enable (required by default). */
async function admin(operatorSlug?: string): Promise<Admin> {
  const email = uniqueEmail();
  const password = 'admin-password-123';
  expect(
    (await t.http().post(`${API}/dev/staff`).send({ email, password, operatorSlug })).status,
  ).toBe(201);
  const login = await t.http().post(`${API}/admin/auth/login`).send({ email, password });
  expect(login.status).toBe(200);
  expect(login.body.staff.twoFactorRequired).toBe(true);
  const token = login.body.accessToken as string;
  const blocked = await t.http().get(`${API}/admin/overview`).set(bearer(token));
  expect(blocked.status).toBe(403);
  expect(blocked.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
  const setup = await t.http().post(`${API}/admin/2fa/setup`).set(bearer(token));
  expect(setup.status).toBe(201);
  const secret = setup.body.secret as string;
  const en = await t
    .http()
    .post(`${API}/admin/2fa/enable`)
    .set(bearer(token))
    .send({ code: totp(secret) });
  expect(en.status).toBe(204);
  return { token, secret, email };
}

async function player(op: string) {
  const res = await t
    .http()
    .post(`${API}/auth/register`)
    .set('X-Compete-Operator', op)
    .send({
      email: uniqueEmail(),
      password: 'correct-horse-battery',
      nickname: `p${Date.now() % 1e8}${n++}`,
      country: 'NL',
      locale: 'en',
      acceptTerms: true,
      confirmAdult: true,
    });
  expect(res.status).toBe(201);
  return {
    id: res.body.player.id as string,
    token: res.body.accessToken as string,
    email: res.body.player.email as string,
  };
}

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  t.md.handleQuote('BTCUSDT', '60000.0', '60000.1', Date.now());
});
afterAll(async () => {
  await t.app.close();
});

describe('compete admin: access', () => {
  it('requires 2FA, then a TOTP code at every login', async () => {
    const a = await admin(`op-${n++}-${Date.now() % 1e6}`);
    expect((await t.http().get(`${API}/admin/overview`).set(bearer(a.token))).status).toBe(200);
    const noCode = await t
      .http()
      .post(`${API}/admin/auth/login`)
      .send({ email: a.email, password: 'admin-password-123' });
    expect(noCode.body.code).toBe('MFA_REQUIRED');
    const ok = await t
      .http()
      .post(`${API}/admin/auth/login`)
      .send({
        email: a.email,
        password: 'admin-password-123',
        code: totp(a.secret, Date.now() + 30_000),
      });
    expect(ok.status).toBe(200);
    expect(ok.body.staff).toMatchObject({
      role: 'OWNER',
      twoFactorEnabled: true,
      twoFactorRequired: false,
    });
  });

  it('admin, player and platform tokens are never interchangeable', async () => {
    const slug = `iso-${Date.now() % 1e6}`;
    const a = await admin(slug);
    const p = await player(slug);
    const trader = await registerUser(t);
    expect((await t.http().get(`${API}/me`).set(bearer(a.token))).status).toBe(401);
    expect((await t.http().get('/api/v1/accounts').set(bearer(a.token))).status).toBe(401);
    expect((await t.http().get('/api/v1/admin/overview').set(bearer(a.token))).status).toBe(401);
    expect((await t.http().get(`${API}/admin/overview`).set(bearer(p.token))).status).toBe(401);
    expect((await t.http().get(`${API}/admin/overview`).set(bearer(trader.token))).status).toBe(
      401,
    );
  });

  it('superadmin creates an operator with one owner; the owner only sees its own operator', async () => {
    const sa = await admin();
    const noOp = await t.http().get(`${API}/admin/overview`).set(bearer(sa.token));
    expect(noOp.body.code).toBe('OPERATOR_REQUIRED');

    const slug = `nova-${Date.now() % 1e6}`;
    const ownerEmail = uniqueEmail();
    const created = await t
      .http()
      .post(`${API}/admin/operators`)
      .set(bearer(sa.token))
      .send({ slug, name: 'Nova Arena', ownerEmail });
    expect(created.status).toBe(201);
    expect(created.body.operator).toMatchObject({ slug, ownerEmail, ownerTwoFactor: false });
    const token = new URL(created.body.setupUrl).searchParams.get('token')!;
    expect(
      (
        await t
          .http()
          .post(`${API}/admin/auth/setup`)
          .send({ token, password: 'owner-password-123' })
      ).status,
    ).toBe(204);
    // The link works once.
    expect(
      (
        await t
          .http()
          .post(`${API}/admin/auth/setup`)
          .send({ token, password: 'owner-password-456' })
      ).body.code,
    ).toBe('SETUP_TOKEN_INVALID');
    const login = await t
      .http()
      .post(`${API}/admin/auth/login`)
      .send({ email: ownerEmail, password: 'owner-password-123' });
    expect(login.body.staff).toMatchObject({ role: 'OWNER', operatorSlug: slug });

    // Second owner for the same operator is impossible (DB constraint).
    await expect(
      prisma.competeStaff.create({
        data: {
          email: uniqueEmail(),
          passwordHash: 'x',
          role: 'OWNER',
          operatorId: created.body.operator.id,
        },
      }),
    ).rejects.toThrow();

    // Owners cannot use superadmin routes nor another operator.
    const owner = await admin(`other-${Date.now() % 1e6}`);
    expect((await t.http().get(`${API}/admin/operators`).set(bearer(owner.token))).status).toBe(
      403,
    );
    const sup = await t
      .http()
      .get(`${API}/admin/overview`)
      .set(bearer(sa.token))
      .set('X-Compete-Admin-Operator', slug);
    expect(sup.status).toBe(200);
    const novaRound = sup.body.current.id as string;
    expect(
      (await t.http().get(`${API}/admin/rounds/${novaRound}`).set(bearer(owner.token))).status,
    ).toBe(404);
    // Owners ignore the operator header.
    const own = await t
      .http()
      .get(`${API}/admin/overview`)
      .set(bearer(owner.token))
      .set('X-Compete-Admin-Operator', slug);
    expect(own.body.current.id).not.toBe(novaRound);
  });
});

describe('compete admin: operating the product', () => {
  it('validates and saves settings; open rounds keep their snapshot', async () => {
    const slug = `set-${Date.now() % 1e6}`;
    const a = await admin(slug);
    const before = (await t.http().get(`${API}/admin/overview`).set(bearer(a.token))).body.current;
    const { currency: _c, ...s } = (await t.http().get(`${API}/admin/settings`).set(bearer(a.token))).body;
    const bad = await t
      .http()
      .put(`${API}/admin/settings`)
      .set(bearer(a.token))
      .send({ ...s, prizeSplitBps: [6000, 3000, 2000] });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('SETTINGS_INVALID');
    const ok = await t
      .http()
      .put(`${API}/admin/settings`)
      .set(bearer(a.token))
      .send({
        ...s,
        name: 'Nova Arena',
        primaryColor: '#f97316',
        entryFeeMinor: '2500',
        minParticipants: 20,
      });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      name: 'Nova Arena',
      primaryColor: '#F97316',
      entryFeeMinor: '2500',
    });
    const pub = await t.http().get(`${API}/operator`).set('X-Compete-Operator', slug);
    expect(pub.body).toMatchObject({
      name: 'Nova Arena',
      entryFeeMinor: '2500',
      minParticipants: 20,
    });
    const round = await prisma.competeRound.findUniqueOrThrow({ where: { id: before.id } });
    expect(round.entryFeeMinor).toBe(1000n);
    const audit = await t.http().get(`${API}/admin/audit`).set(bearer(a.token));
    expect(audit.body.chainIntact).toBe(true);
    expect(audit.body.items.map((i: { action: string }) => i.action)).toContain(
      'compete.operator.settings_updated',
    );
  });

  it('suspends a player (sessions revoked, login refused) and reactivates', async () => {
    const slug = `pl-${Date.now() % 1e6}`;
    const a = await admin(slug);
    const p = await player(slug);
    const list = await t.http().get(`${API}/admin/players`).set(bearer(a.token));
    expect(list.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    expect(
      (
        await t
          .http()
          .post(`${API}/admin/players/${p.id}/suspend`)
          .set(bearer(a.token))
          .send({ reason: 'Multiple accounts' })
      ).status,
    ).toBe(204);
    const login = await t
      .http()
      .post(`${API}/auth/login`)
      .set('X-Compete-Operator', slug)
      .send({ email: p.email, password: 'correct-horse-battery' });
    expect(login.body.code).toBe('PLAYER_SUSPENDED');
    await t
      .http()
      .post(`${API}/admin/players/${p.id}/reactivate`)
      .set(bearer(a.token))
      .send({ reason: 'Resolved' });
    const again = await t
      .http()
      .post(`${API}/auth/login`)
      .set('X-Compete-Operator', slug)
      .send({ email: p.email, password: 'correct-horse-battery' });
    expect(again.status).toBe(200);
  });

  it('lists prizes awaiting payout and records a payout once', async () => {
    const slug = `pay-${Date.now() % 1e6}`;
    const a = await admin(slug);
    const round = (
      await t
        .http()
        .post(`${API}/dev/rounds`)
        .set('X-Compete-Operator', slug)
        .send({ startsInSec: 1, durationSec: 600, minParticipants: 3 })
    ).body;
    const bots = await t.http().post(`${API}/dev/bots`).send({ roundId: round.id, count: 3 });
    expect(bots.status).toBe(201);
    await sleep(Date.parse(round.startsAt) - Date.now() + 50);
    t.md.handleQuote('BTCUSDT', '60000.0', '60000.1', Date.now());
    await t.http().post(`${API}/dev/tick`).send({});
    await t.http().post(`${API}/dev/tick`).send({ at: round.endsAt });

    const detail = await t.http().get(`${API}/admin/rounds/${round.id}`).set(bearer(a.token));
    expect(detail.body.round).toMatchObject({
      status: 'SETTLED',
      participants: 3,
      potMinor: '3000',
      operatorShareMinor: '600',
    });
    expect(detail.body.rows).toHaveLength(3);

    const due = await t.http().get(`${API}/admin/payouts`).set(bearer(a.token));
    expect(due.body.map((x: { amountMinor: string }) => x.amountMinor).sort()).toEqual(
      ['1200', '480', '720'].sort(),
    );
    const first = due.body[0].id as string;
    expect(
      (
        await t
          .http()
          .post(`${API}/admin/payouts/${first}/mark-paid`)
          .set(bearer(a.token))
          .send({ reference: 'BANK-123' })
      ).status,
    ).toBe(204);
    const twice = await t
      .http()
      .post(`${API}/admin/payouts/${first}/mark-paid`)
      .set(bearer(a.token))
      .send({ reference: 'BANK-123' });
    expect(twice.body.code).toBe('PAYOUT_NOT_PENDING');
    const paid = await t.http().get(`${API}/admin/payouts?status=SUCCEEDED`).set(bearer(a.token));
    expect(paid.body).toHaveLength(1);

    const ov = await t.http().get(`${API}/admin/overview`).set(bearer(a.token));
    expect(ov.body).toMatchObject({
      roundsSettled30d: 1,
      entries30d: 3,
      netEntryFeesMinor30d: '3000',
      operatorRevenueMinor30d: '600',
      awaitingPayouts: 2,
    });
  });
});
