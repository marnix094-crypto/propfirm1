import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { totp } from '../src/modules/security/totp.js';
import type { FirmRole } from '../src/generated/prisma/client.js';
import { createTestApp, registerUser, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Registered user (optionally in another firm) with 2FA enabled. */
async function staff(role: FirmRole | null, opts: { firm?: string; superadmin?: boolean } = {}) {
  const u = await registerWith(opts.firm);
  await prisma.user.update({
    where: { id: u.id },
    data: { firmRole: role, ...(opts.superadmin ? { roles: ['TRADER', 'ADMIN'] } : {}) },
  });
  const setup = await t.http().post('/api/v1/me/2fa/setup').set(bearer(u.token));
  await t
    .http()
    .post('/api/v1/me/2fa/enable')
    .set(bearer(u.token))
    .send({ code: totp(setup.body.secret as string) });
  return u;
}

async function registerWith(firmSlug?: string, email = uniqueEmail()) {
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .set(firmSlug ? { 'X-Firm': firmSlug } : {})
    .send({
      email,
      password: 'correct-horse-battery',
      country: 'NL',
      locale: 'en',
      acceptTerms: true,
    });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;
  const id = (
    JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }
  ).sub;
  const accounts = await t.http().get('/api/v1/accounts').set(bearer(token));
  return { id, email, token, accountId: accounts.body[0].id as string };
}

const slug = () => `firm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

let superadmin: Awaited<ReturnType<typeof staff>>;
let ownerA: Awaited<ReturnType<typeof staff>>;
let firmB: { id: string; slug: string };
let ownerB: Awaited<ReturnType<typeof staff>>;

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  superadmin = await staff(null, { superadmin: true });
  ownerA = await staff('OWNER');
  const s = slug();
  const ownerEmail = uniqueEmail();
  const created = await t
    .http()
    .post('/api/v1/admin/firms')
    .set(bearer(superadmin.token))
    .send({ name: 'Acme Trading', slug: s, ownerEmail });
  expect(created.status).toBe(201);
  const f = (created.body.items as { id: string; slug: string }[]).find((x) => x.slug === s)!;
  firmB = { id: f.id, slug: f.slug };
  expect(t.mail.last(ownerEmail)!.text).toContain('reset-password?token=');
  // The invited owner exists in firm B; give them a usable session for the tests.
  ownerB = await staff('OWNER', { firm: s });
});

afterAll(async () => {
  await t.app.close();
});

describe('admin access', () => {
  it('refuses traders and requires 2FA for staff', async () => {
    const trader = await registerUser(t);
    expect((await t.http().get('/api/v1/admin/me').set(bearer(trader.token))).body.code).toBe(
      'ADMIN_FORBIDDEN',
    );

    const noTwoFa = await registerUser(t);
    await prisma.user.update({ where: { id: noTwoFa.id }, data: { firmRole: 'ADMIN' } });
    const me = await t.http().get('/api/v1/admin/me').set(bearer(noTwoFa.token));
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      role: 'ADMIN',
      twoFactorEnabled: false,
      twoFactorRequired: true,
    });
    expect(
      (await t.http().get('/api/v1/admin/overview').set(bearer(noTwoFa.token))).body.code,
    ).toBe('ADMIN_2FA_REQUIRED');
  });

  it('support staff can read but not act', async () => {
    const support = await staff('SUPPORT');
    const trader = await registerUser(t);
    expect((await t.http().get('/api/v1/admin/traders').set(bearer(support.token))).status).toBe(
      200,
    );
    const res = await t
      .http()
      .post(`/api/v1/admin/traders/${trader.id}/suspend`)
      .set(bearer(support.token))
      .send({ reason: 'test' });
    expect(res.body.code).toBe('ADMIN_ROLE_INSUFFICIENT');
  });
});

describe('tenant isolation', () => {
  it('the same email can register in two firms; login is per firm', async () => {
    const email = uniqueEmail();
    await registerWith(undefined, email);
    await registerWith(firmB.slug, email);
    const login = (firm?: string) =>
      t
        .http()
        .post('/api/v1/auth/login')
        .set(firm ? { 'X-Firm': firm } : {})
        .send({ email, password: 'correct-horse-battery' });
    expect((await login()).status).toBe(200);
    expect((await login(firmB.slug)).status).toBe(200);
    expect((await login('no-such-firm')).body.code).toBe('FIRM_NOT_FOUND');
  });

  it('firm staff only ever see their own firm', async () => {
    const traderB = await registerWith(firmB.slug);
    const listA = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set(bearer(ownerA.token));
    expect(listA.body.items).toHaveLength(0);
    expect(
      (await t.http().get(`/api/v1/admin/traders/${traderB.id}`).set(bearer(ownerA.token))).status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .post(`/api/v1/admin/accounts/${traderB.accountId}/fail`)
          .set(bearer(ownerA.token))
          .send({ reason: 'cross-tenant attempt' })
      ).status,
    ).toBe(404);
    // Only superadmins may switch firm.
    expect(
      (
        await t
          .http()
          .get('/api/v1/admin/traders')
          .set({ ...bearer(ownerA.token), 'X-Admin-Firm': firmB.id })
      ).body.code,
    ).toBe('ADMIN_FORBIDDEN');
    const asSuper = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set({ ...bearer(superadmin.token), 'X-Admin-Firm': firmB.id });
    expect(asSuper.body.items).toHaveLength(1);
    // Firm B's own owner sees the trader.
    const listB = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set(bearer(ownerB.token));
    expect(listB.body.items[0].id).toBe(traderB.id);
    // Firm list is superadmin-only.
    expect((await t.http().get('/api/v1/admin/firms').set(bearer(ownerA.token))).status).toBe(403);
  });
});

describe('trader and account actions', () => {
  it('suspends a trader (sign-out, audit) and reactivates', async () => {
    const trader = await registerUser(t);
    const res = await t
      .http()
      .post(`/api/v1/admin/traders/${trader.id}/suspend`)
      .set(bearer(ownerA.token))
      .send({ reason: 'chargeback' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');
    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: trader.email, password: 'correct-horse-battery' });
    expect(login.body.code).toBe('ACCOUNT_SUSPENDED');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'admin.user_suspended', entityId: trader.id },
    });
    expect(audit).toMatchObject({ actorType: 'ADMIN', actorId: ownerA.id });
    expect(audit!.firmId).not.toBeNull();
    const back = await t
      .http()
      .post(`/api/v1/admin/traders/${trader.id}/reactivate`)
      .set(bearer(ownerA.token))
      .send({ reason: 'resolved' });
    expect(back.body.status).toBe('ACTIVE');
    // Staff cannot be suspended from the trader list.
    const self = await t
      .http()
      .post(`/api/v1/admin/traders/${ownerA.id}/suspend`)
      .set(bearer(ownerA.token))
      .send({ reason: 'nope' });
    expect(self.body.code).toBe('STAFF_PROTECTED');
  });

  it('fails an active account by hand', async () => {
    const trader = await registerUser(t);
    const res = await t
      .http()
      .post(`/api/v1/admin/accounts/${trader.accountId}/fail`)
      .set(bearer(ownerA.token))
      .send({ reason: 'terms violation' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'FAILED', failReason: 'ADMIN' });
    const again = await t
      .http()
      .post(`/api/v1/admin/accounts/${trader.accountId}/fail`)
      .set(bearer(ownerA.token))
      .send({ reason: 'twice' });
    expect(again.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});

describe('catalogue per firm', () => {
  it('new rule set version → product → only visible in that firm', async () => {
    const rules = await t.http().get('/api/v1/admin/rule-sets').set(bearer(ownerB.token));
    const template = (
      rules.body.items as { id: string; isTemplate: boolean; profitSplitBps: number | null }[]
    ).find((r) => r.isTemplate && r.profitSplitBps !== null)!;
    const created = await t
      .http()
      .post('/api/v1/admin/rule-sets')
      .set(bearer(ownerB.token))
      .send({ basedOnId: template.id, name: 'Acme 90/10', profitSplitBps: 9000 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ isTemplate: false, version: 1, profitSplitBps: 9000 });
    const v2 = await t
      .http()
      .post('/api/v1/admin/rule-sets')
      .set(bearer(ownerB.token))
      .send({ basedOnId: created.body.id, name: 'Acme 90/10 v2', maxDailyLossBps: 400 });
    expect(v2.body.version).toBe(2);
    const bad = await t.http().post('/api/v1/admin/rule-sets').set(bearer(ownerB.token)).send({
      basedOnId: template.id,
      name: 'Broken',
      maxDailyLossBps: 1500,
      maxDrawdownBps: 1000,
    });
    expect(bad.body.code).toBe('RULES_INCONSISTENT');

    const product = await t.http().post('/api/v1/admin/products').set(bearer(ownerB.token)).send({
      slug: 'acme-15k',
      accountSizeMinor: '1500000',
      priceMinor: '12900',
      ruleSetId: created.body.id,
    });
    expect(product.status).toBe(201);
    const slugsFor = async (firm?: string) =>
      (
        (
          await t
            .http()
            .get('/api/v1/products')
            .set(firm ? { 'X-Firm': firm } : {})
        ).body.items as { slug: string }[]
      ).map((p) => p.slug);
    expect(await slugsFor(firmB.slug)).toContain('acme-15k');
    expect(await slugsFor()).not.toContain('acme-15k');
    // Firm A cannot use firm B's rule set.
    const foreign = await t.http().post('/api/v1/admin/products').set(bearer(ownerA.token)).send({
      slug: 'stolen',
      accountSizeMinor: '1500000',
      priceMinor: '12900',
      ruleSetId: created.body.id,
    });
    expect(foreign.status).toBe(404);

    const hidden = await t
      .http()
      .patch(`/api/v1/admin/products/${product.body.id}`)
      .set(bearer(ownerB.token))
      .send({ isActive: false, priceMinor: '9900' });
    expect(hidden.body).toMatchObject({ isActive: false, priceMinor: '9900' });
    expect(await slugsFor(firmB.slug)).not.toContain('acme-15k');
  });
});

describe('branding', () => {
  it('updates the public branding and resolves the firm by domain', async () => {
    const domain = `${firmB.slug}.example.com`;
    const res = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(ownerB.token))
      .send({ name: 'Acme Prop', primaryColor: '#ff5a1f', domain });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Acme Prop', primaryColor: '#FF5A1F', domain });
    const pub = await t.http().get('/api/v1/public/firm').set('Host', domain);
    expect(pub.body).toMatchObject({ slug: firmB.slug, name: 'Acme Prop', isDefault: false });
    expect((await t.http().get('/api/v1/public/firm')).body.isDefault).toBe(true);

    const taken = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(ownerA.token))
      .send({ domain });
    expect(taken.body.code).toBe('DOMAIN_TAKEN');
    const badLogo = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(ownerB.token))
      .send({ logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(badLogo.status).toBe(400);
  });
});

describe('risk alerts and audit', () => {
  it('lists and acknowledges alerts of the own firm only', async () => {
    const trader = await registerUser(t);
    const firmA = await prisma.user.findUniqueOrThrow({ where: { id: trader.id } });
    const alert = await prisma.riskAlert.create({
      data: {
        firmId: firmA.firmId,
        accountId: trader.accountId,
        userId: trader.id,
        type: 'LARGE_LOSS',
        severity: 'WARNING',
        dedupKey: `test:${trader.accountId}`,
        details: { realizedPnlMinor: '-250000' },
      },
    });
    const listed = await t.http().get('/api/v1/admin/alerts').set(bearer(ownerA.token));
    expect((listed.body.items as { id: string }[]).map((a) => a.id)).toContain(alert.id);
    expect(
      (await t.http().post(`/api/v1/admin/alerts/${alert.id}/ack`).set(bearer(ownerB.token)))
        .status,
    ).toBe(404);
    expect(
      (await t.http().post(`/api/v1/admin/alerts/${alert.id}/ack`).set(bearer(ownerA.token)))
        .status,
    ).toBe(204);
    const open = await t.http().get('/api/v1/admin/alerts').set(bearer(ownerA.token));
    expect((open.body.items as { id: string }[]).map((a) => a.id)).not.toContain(alert.id);
  });

  it('shows the firm audit trail and verifies the chain', async () => {
    const page = await t.http().get('/api/v1/admin/audit?action=admin.').set(bearer(ownerA.token));
    expect(page.status).toBe(200);
    expect(
      (page.body.items as { action: string }[]).every((r) => r.action.startsWith('admin.')),
    ).toBe(true);
    const v = await t.http().get('/api/v1/admin/audit/verify').set(bearer(ownerA.token));
    expect(v.body.ok).toBe(true);
  });
});

describe('team', () => {
  it('owner invites, admins cannot grant owner, last owner stays', async () => {
    const email = uniqueEmail();
    const invited = await t
      .http()
      .post('/api/v1/admin/team')
      .set(bearer(ownerB.token))
      .send({ email, role: 'ADMIN' });
    expect(invited.status).toBe(201);
    expect(t.mail.last(email)).toBeTruthy();
    const member = (invited.body.items as { id: string; email: string }[]).find(
      (m) => m.email === email,
    )!;

    const adminB = await staff('ADMIN', { firm: firmB.slug });
    const grantOwner = await t
      .http()
      .post('/api/v1/admin/team')
      .set(bearer(adminB.token))
      .send({ email: uniqueEmail(), role: 'OWNER' });
    expect(grantOwner.body.code).toBe('ADMIN_ROLE_INSUFFICIENT');

    // Firm B has two owners (invited at creation + ownerB); demote both → the last one refuses.
    const owners = (
      (await t.http().get('/api/v1/admin/team').set(bearer(ownerB.token))).body.items as {
        id: string;
        role: string;
      }[]
    ).filter((m) => m.role === 'OWNER');
    for (const o of owners.filter((x) => x.id !== ownerB.id))
      await t
        .http()
        .patch(`/api/v1/admin/team/${o.id}`)
        .set(bearer(ownerB.token))
        .send({ role: 'ADMIN' });
    const last = await t
      .http()
      .patch(`/api/v1/admin/team/${ownerB.id}`)
      .set(bearer(ownerB.token))
      .send({ role: 'ADMIN' });
    expect(last.body.code).toBe('LAST_OWNER');

    const removed = await t
      .http()
      .delete(`/api/v1/admin/team/${member.id}`)
      .set(bearer(ownerB.token));
    expect((removed.body.items as { id: string }[]).map((m) => m.id)).not.toContain(member.id);
  });

  it('a suspended firm refuses logins', async () => {
    const s = slug();
    const created = await t
      .http()
      .post('/api/v1/admin/firms')
      .set(bearer(superadmin.token))
      .send({ name: 'Short Lived', slug: s, ownerEmail: uniqueEmail() });
    const f = (created.body.items as { id: string; slug: string }[]).find((x) => x.slug === s)!;
    const trader = await registerWith(s);
    await t
      .http()
      .post(`/api/v1/admin/firms/${f.id}/status`)
      .set(bearer(superadmin.token))
      .send({ status: 'SUSPENDED' });
    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Firm', s)
      .send({ email: trader.email, password: 'correct-horse-battery' });
    expect(login.body.code).toBe('FIRM_SUSPENDED');
  });
});
