import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { totp } from '../src/modules/security/totp.js';
import { createTestApp, uniqueEmail, type TestApp } from './app.js';
import { DNS_RESOLVER, type FakeDnsResolver } from '../src/modules/provisioning/dns-resolver.js';

let t: TestApp;
let prisma: PrismaService;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PASSWORD = 'correct-horse-battery';
const subOf = (token: string) =>
  (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;

interface Staff {
  id: string;
  email: string;
  token: string;
  firmId: string;
  slug: string;
}

const adminLogin = (email: string, password = PASSWORD) =>
  t.http().post('/api/v1/auth/login').send({ email, password, audience: 'admin' });

/** Staff account via the dev endpoint, signed in on the admin login, optionally with 2FA. */
async function staff(opts: { superadmin?: boolean; twoFactor?: boolean } = {}): Promise<Staff> {
  const email = uniqueEmail();
  const created = await t
    .http()
    .post('/api/v1/dev/staff')
    .send({ email, password: PASSWORD, superadmin: !!opts.superadmin });
  expect(created.status).toBe(201);
  const login = await adminLogin(email);
  expect(login.status).toBe(200);
  const token = login.body.accessToken as string;
  if (opts.twoFactor !== false) {
    const setup = await t.http().post('/api/v1/me/2fa/setup').set(bearer(token));
    await t
      .http()
      .post('/api/v1/me/2fa/enable')
      .set(bearer(token))
      .send({ code: totp(setup.body.secret as string) });
  }
  return { id: subOf(token), email, token, ...(created.body as { firmId: string; slug: string }) };
}

/** A client (trader) of a firm. */
async function client(firmSlug?: string, email = uniqueEmail()) {
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .set(firmSlug ? { 'X-Firm': firmSlug } : {})
    .send({ email, password: PASSWORD, country: 'NL', locale: 'en', acceptTerms: true });
  expect(res.status).toBe(201);
  const token = res.body.accessToken as string;
  const accounts = await t.http().get('/api/v1/accounts').set(bearer(token));
  return { id: subOf(token), email, token, accountId: accounts.body[0].id as string };
}

const slug = () => `firm-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

let superadmin: Staff;
let adminA: Staff;
let adminB: Staff;

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  superadmin = await staff({ superadmin: true });
  adminA = await staff();
  adminB = await staff();
});

afterAll(async () => {
  await t.app.close();
});

describe('separate admin accounts', () => {
  it('admins only sign in on the admin login, clients only on the client login', async () => {
    const c = await client(adminA.slug);
    const asClient = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Firm', adminA.slug)
      .send({ email: adminA.email, password: PASSWORD });
    expect(asClient.body.code).toBe('INVALID_CREDENTIALS');
    expect((await adminLogin(c.email)).body.code).toBe('INVALID_CREDENTIALS');
  });

  it('clients never get into the admin panel; admins need 2FA', async () => {
    const c = await client(adminA.slug);
    expect((await t.http().get('/api/v1/admin/me').set(bearer(c.token))).body.code).toBe(
      'ADMIN_FORBIDDEN',
    );
    const no2fa = await staff({ twoFactor: false });
    const me = await t.http().get('/api/v1/admin/me').set(bearer(no2fa.token));
    expect(me.body).toMatchObject({
      role: 'OWNER',
      twoFactorEnabled: false,
      twoFactorRequired: true,
    });
    expect((await t.http().get('/api/v1/admin/overview').set(bearer(no2fa.token))).body.code).toBe(
      'ADMIN_2FA_REQUIRED',
    );
  });

  it('the traders list never shows admins', async () => {
    const list = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(adminA.email)}`)
      .set(bearer(adminA.token));
    expect(list.body.items).toHaveLength(0);
  });
});

describe('Daily Funded manages firms and their admin', () => {
  it('creates a firm with an admin, replaces and re-invites the admin', async () => {
    const s = slug();
    const email = uniqueEmail();
    const created = await t
      .http()
      .post('/api/v1/admin/firms')
      .set(bearer(superadmin.token))
      .send({ name: 'Acme Trading', slug: s, ownerEmail: email });
    expect(created.status).toBe(201);
    const firm = (created.body.items as { id: string; slug: string; admin: unknown }[]).find(
      (f) => f.slug === s,
    )!;
    expect(firm.admin).toMatchObject({ email, activated: false });
    expect(t.mail.last(email)!.text).toMatch(/reset-password\?token=[\w-]+&for=admin/);
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(await prisma.tradingAccount.count({ where: { userId: user.id } })).toBe(0);

    const taken = await t
      .http()
      .post(`/api/v1/admin/firms/${firm.id}/admin`)
      .set(bearer(superadmin.token))
      .send({ email: adminA.email });
    expect(taken.body.code).toBe('STAFF_EMAIL_TAKEN');

    const next = uniqueEmail();
    const replaced = await t
      .http()
      .post(`/api/v1/admin/firms/${firm.id}/admin`)
      .set(bearer(superadmin.token))
      .send({ email: next });
    expect(
      (replaced.body.items as { id: string; admin: { email: string } }[]).find(
        (f) => f.id === firm.id,
      )!.admin.email,
    ).toBe(next);
    expect((await prisma.user.findFirstOrThrow({ where: { email } })).status).toBe('SUSPENDED');

    expect(
      (
        await t
          .http()
          .post(`/api/v1/admin/firms/${firm.id}/admin/invite`)
          .set(bearer(superadmin.token))
      ).status,
    ).toBe(204);
    expect(t.mail.last(next)!.text).toContain('for=admin');
  });

  it('firm admins cannot manage firms or other admins', async () => {
    expect((await t.http().get('/api/v1/admin/firms').set(bearer(adminA.token))).status).toBe(403);
    expect(
      (
        await t
          .http()
          .post(`/api/v1/admin/firms/${adminB.firmId}/admin`)
          .set(bearer(adminA.token))
          .send({ email: uniqueEmail() })
      ).status,
    ).toBe(403);
  });

  it('a suspended firm refuses client and admin logins', async () => {
    const victim = await staff();
    const c = await client(victim.slug);
    await t
      .http()
      .post(`/api/v1/admin/firms/${victim.firmId}/status`)
      .set(bearer(superadmin.token))
      .send({ status: 'SUSPENDED' });
    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Firm', victim.slug)
      .send({ email: c.email, password: PASSWORD });
    expect(login.body.code).toBe('FIRM_SUSPENDED');
    expect((await adminLogin(victim.email)).body.code).toBe('FIRM_SUSPENDED');
  });
});

describe('tenant isolation', () => {
  it('the same email can be a client in two firms; login is per firm', async () => {
    const email = uniqueEmail();
    await client(adminA.slug, email);
    await client(adminB.slug, email);
    const login = (firm: string) =>
      t.http().post('/api/v1/auth/login').set('X-Firm', firm).send({ email, password: PASSWORD });
    expect((await login(adminA.slug)).status).toBe(200);
    expect((await login(adminB.slug)).status).toBe(200);
    expect((await login('no-such-firm')).body.code).toBe('FIRM_NOT_FOUND');
  });

  it('a firm admin only ever sees their own firm', async () => {
    const traderB = await client(adminB.slug);
    const listA = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set(bearer(adminA.token));
    expect(listA.body.items).toHaveLength(0);
    expect(
      (await t.http().get(`/api/v1/admin/traders/${traderB.id}`).set(bearer(adminA.token))).status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .post(`/api/v1/admin/accounts/${traderB.accountId}/fail`)
          .set(bearer(adminA.token))
          .send({ reason: 'cross-tenant attempt' })
      ).status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .get('/api/v1/admin/traders')
          .set({ ...bearer(adminA.token), 'X-Admin-Firm': adminB.firmId })
      ).body.code,
    ).toBe('ADMIN_FORBIDDEN');
    const asSuper = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set({ ...bearer(superadmin.token), 'X-Admin-Firm': adminB.firmId });
    expect(asSuper.body.items).toHaveLength(1);
    const listB = await t
      .http()
      .get(`/api/v1/admin/traders?q=${encodeURIComponent(traderB.email)}`)
      .set(bearer(adminB.token));
    expect(listB.body.items[0].id).toBe(traderB.id);
  });
});

describe('client dashboard modules', () => {
  it('switched-off modules disappear for clients of that firm only', async () => {
    const cA = await client(adminA.slug);
    const cB = await client(adminB.slug);
    const off = await t
      .http()
      .put('/api/v1/admin/modules')
      .set(bearer(adminA.token))
      .send({ disabled: ['points', 'copier', 'transparency'] });
    expect(off.body.disabled).toEqual(['copier', 'points', 'transparency']);
    expect((await t.http().get('/api/v1/points').set(bearer(cA.token))).body.code).toBe(
      'MODULE_NOT_FOUND',
    );
    expect((await t.http().get('/api/v1/copier').set(bearer(cA.token))).status).toBe(404);
    expect(
      (await t.http().get('/api/v1/public/transparency').set('X-Firm', adminA.slug)).status,
    ).toBe(404);
    expect(
      (await t.http().get('/api/v1/public/firm').set('X-Firm', adminA.slug)).body.disabledModules,
    ).toEqual(['copier', 'points', 'transparency']);
    expect((await t.http().get('/api/v1/points').set(bearer(cB.token))).status).toBe(200);

    const bad = await t
      .http()
      .put('/api/v1/admin/modules')
      .set(bearer(adminA.token))
      .send({ disabled: ['trade'] });
    expect(bad.status).toBe(400);
    await t.http().put('/api/v1/admin/modules').set(bearer(adminA.token)).send({ disabled: [] });
    expect((await t.http().get('/api/v1/points').set(bearer(cA.token))).status).toBe(200);
  });
});

describe('trader and account actions', () => {
  it('suspends a trader (sign-out, audit) and reactivates', async () => {
    const trader = await client(adminA.slug);
    const res = await t
      .http()
      .post(`/api/v1/admin/traders/${trader.id}/suspend`)
      .set(bearer(adminA.token))
      .send({ reason: 'chargeback' });
    expect(res.body.status).toBe('SUSPENDED');
    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Firm', adminA.slug)
      .send({ email: trader.email, password: PASSWORD });
    expect(login.body.code).toBe('ACCOUNT_SUSPENDED');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'admin.user_suspended', entityId: trader.id },
    });
    expect(audit).toMatchObject({ actorType: 'ADMIN', actorId: adminA.id, firmId: adminA.firmId });
    const back = await t
      .http()
      .post(`/api/v1/admin/traders/${trader.id}/reactivate`)
      .set(bearer(adminA.token))
      .send({ reason: 'resolved' });
    expect(back.body.status).toBe('ACTIVE');
  });

  it('fails an active account by hand', async () => {
    const trader = await client(adminA.slug);
    const res = await t
      .http()
      .post(`/api/v1/admin/accounts/${trader.accountId}/fail`)
      .set(bearer(adminA.token))
      .send({ reason: 'terms violation' });
    expect(res.body).toMatchObject({ status: 'FAILED', failReason: 'ADMIN' });
    const again = await t
      .http()
      .post(`/api/v1/admin/accounts/${trader.accountId}/fail`)
      .set(bearer(adminA.token))
      .send({ reason: 'twice' });
    expect(again.body.code).toBe('ACCOUNT_NOT_ACTIVE');
  });
});

describe('catalogue per firm', () => {
  it('new rule set version → product → only visible in that firm', async () => {
    const rules = await t.http().get('/api/v1/admin/rule-sets').set(bearer(adminB.token));
    const template = (
      rules.body.items as { id: string; isTemplate: boolean; profitSplitBps: number | null }[]
    ).find((r) => r.isTemplate && r.profitSplitBps !== null)!;
    const created = await t
      .http()
      .post('/api/v1/admin/rule-sets')
      .set(bearer(adminB.token))
      .send({ basedOnId: template.id, name: 'Acme 90/10', profitSplitBps: 9000 });
    expect(created.body).toMatchObject({ isTemplate: false, version: 1, profitSplitBps: 9000 });
    const v2 = await t
      .http()
      .post('/api/v1/admin/rule-sets')
      .set(bearer(adminB.token))
      .send({ basedOnId: created.body.id, name: 'Acme 90/10 v2', maxDailyLossBps: 400 });
    expect(v2.body.version).toBe(2);
    const bad = await t.http().post('/api/v1/admin/rule-sets').set(bearer(adminB.token)).send({
      basedOnId: template.id,
      name: 'Broken',
      maxDailyLossBps: 1500,
      maxDrawdownBps: 1000,
    });
    expect(bad.body.code).toBe('RULES_INCONSISTENT');

    const product = await t.http().post('/api/v1/admin/products').set(bearer(adminB.token)).send({
      slug: 'acme-15k',
      accountSizeMinor: '1500000',
      priceMinor: '12900',
      ruleSetId: created.body.id,
    });
    expect(product.status).toBe(201);
    const slugsFor = async (firm: string) =>
      (
        (await t.http().get('/api/v1/products').set('X-Firm', firm)).body.items as {
          slug: string;
        }[]
      ).map((p) => p.slug);
    expect(await slugsFor(adminB.slug)).toContain('acme-15k');
    expect(await slugsFor(adminA.slug)).not.toContain('acme-15k');
    const foreign = await t.http().post('/api/v1/admin/products').set(bearer(adminA.token)).send({
      slug: 'stolen',
      accountSizeMinor: '1500000',
      priceMinor: '12900',
      ruleSetId: created.body.id,
    });
    expect(foreign.status).toBe(404);
    const hidden = await t
      .http()
      .patch(`/api/v1/admin/products/${product.body.id}`)
      .set(bearer(adminB.token))
      .send({ isActive: false, priceMinor: '9900' });
    expect(hidden.body).toMatchObject({ isActive: false, priceMinor: '9900' });
    expect(await slugsFor(adminB.slug)).not.toContain('acme-15k');
  });
});

describe('branding', () => {
  it('updates the public branding and resolves the firm by domain', async () => {
    const domain = `${adminB.slug}.example.com`;
    const res = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(adminB.token))
      .send({ name: 'Acme Prop', primaryColor: '#ff5a1f', domain });
    expect(res.body).toMatchObject({
      name: 'Acme Prop',
      primaryColor: '#FF5A1F',
      domain,
      domainStatus: 'PENDING_DNS',
    });
    // An unverified domain routes nothing (D95) …
    expect((await t.http().get('/api/v1/public/firm').set('Host', domain)).body.isDefault).toBe(
      true,
    );
    const setup = await t.http().get('/api/v1/admin/branding/domain').set(bearer(adminB.token));
    expect(setup.body).toMatchObject({
      domain,
      status: 'PENDING_DNS',
      cnameTarget: 'tenants.dailyfunded.test',
      txtName: `_dailyfunded-verify.${domain}`,
    });
    // … until the TXT token and the CNAME are in DNS.
    const dns = t.app.get<FakeDnsResolver>(DNS_RESOLVER);
    dns.set('TXT', setup.body.txtName, [setup.body.txtValue]);
    dns.set('CNAME', domain, ['tenants.dailyfunded.test']);
    const checked = await t
      .http()
      .post('/api/v1/admin/branding/domain/check')
      .set(bearer(adminB.token));
    expect(checked.body.status).toBe('ACTIVE');
    const pub = await t.http().get('/api/v1/public/firm').set('Host', domain);
    expect(pub.body).toMatchObject({ slug: adminB.slug, name: 'Acme Prop', isDefault: false });
    expect((await t.http().get('/api/v1/public/firm')).body.isDefault).toBe(true);
    const taken = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(adminA.token))
      .send({ domain });
    expect(taken.body.code).toBe('DOMAIN_TAKEN');
    const badLogo = await t
      .http()
      .put('/api/v1/admin/branding')
      .set(bearer(adminB.token))
      .send({ logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
    expect(badLogo.status).toBe(400);
  });
});

describe('risk alerts and audit', () => {
  it('lists and acknowledges alerts of the own firm only', async () => {
    const trader = await client(adminA.slug);
    const alert = await prisma.riskAlert.create({
      data: {
        firmId: adminA.firmId,
        accountId: trader.accountId,
        userId: trader.id,
        type: 'LARGE_LOSS',
        severity: 'WARNING',
        dedupKey: `test:${trader.accountId}`,
        details: { realizedPnlMinor: '-250000' },
      },
    });
    const listed = await t.http().get('/api/v1/admin/alerts').set(bearer(adminA.token));
    expect((listed.body.items as { id: string }[]).map((a) => a.id)).toContain(alert.id);
    expect(
      (await t.http().post(`/api/v1/admin/alerts/${alert.id}/ack`).set(bearer(adminB.token)))
        .status,
    ).toBe(404);
    expect(
      (await t.http().post(`/api/v1/admin/alerts/${alert.id}/ack`).set(bearer(adminA.token)))
        .status,
    ).toBe(204);
  });

  it('shows the firm audit trail and verifies the chain', async () => {
    const page = await t.http().get('/api/v1/admin/audit?action=admin.').set(bearer(adminA.token));
    expect(page.status).toBe(200);
    expect(
      (page.body.items as { action: string }[]).every((r) => r.action.startsWith('admin.')),
    ).toBe(true);
    const v = await t.http().get('/api/v1/admin/audit/verify').set(bearer(adminA.token));
    expect(v.body.ok).toBe(true);
  });
});
