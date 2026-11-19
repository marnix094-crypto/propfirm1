import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { totp } from '../src/modules/security/totp.js';
import {
  DATABASE_PROVISIONER,
  type FakeDatabaseProvisioner,
} from '../src/modules/provisioning/database-provisioner.js';
import { DNS_RESOLVER, type FakeDnsResolver } from '../src/modules/provisioning/dns-resolver.js';
import { createTestApp, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let token: string;
const PASSWORD = 'correct-horse-battery';
const BASE = 'dailyfunded.test';
const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const slug = () => `prov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

async function createFirm(body: Record<string, unknown>) {
  const res = await t.http().post('/api/v1/admin/firms').set(bearer(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.items.find((f: { slug: string }) => f.slug === body.slug);
}
const stepsOf = (firm: { provisioning: { step: string; status: string; detail: string }[] }) =>
  Object.fromEntries(firm.provisioning.map((s) => [s.step, `${s.status}:${s.detail}`]));

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
  const email = uniqueEmail();
  await t.http().post('/api/v1/dev/staff').send({ email, password: PASSWORD, superadmin: true });
  const login = await t
    .http()
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD, audience: 'admin' });
  token = login.body.accessToken;
  const setup = await t.http().post('/api/v1/me/2fa/setup').set(bearer(token));
  await t
    .http()
    .post('/api/v1/me/2fa/enable')
    .set(bearer(token))
    .send({ code: totp(setup.body.secret) });
});
afterAll(async () => {
  await t.app.close();
});

describe('automatic firm set-up (D93)', () => {
  it('a new firm on the shared platform is ready at once on its subdomain', async () => {
    const s = slug();
    const firm = await createFirm({ name: 'Acme Prop', slug: s, ownerEmail: uniqueEmail() });
    expect(stepsOf(firm)).toEqual({
      TENANT: 'DONE:CATALOGUE_READY',
      ADMIN: 'DONE:ADMIN_INVITED',
      DATABASE: 'DONE:SHARED',
      SUBDOMAIN: 'DONE:ACTIVE',
      CUSTOM_DOMAIN: 'SKIPPED:NO_DOMAIN',
    });
    expect(firm).toMatchObject({ subdomain: `${s}.${BASE}`, dedicatedDatabase: false });
    const pub = await t.http().get('/api/v1/public/firm').set('Host', `${s}.${BASE}`);
    expect(pub.body).toMatchObject({ slug: s, name: 'Acme Prop' });
    const products = await prisma.product.count({ where: { firm: { slug: s } } });
    expect(products).toBeGreaterThan(0);
    const route = await t
      .http()
      .get('/api/v1/internal/route')
      .query({ host: `${s}.${BASE}` });
    expect(route.body).toEqual({ firm: s, instance: 'shared' });
    expect(
      (
        await t
          .http()
          .get('/api/v1/internal/tls/allow')
          .query({ domain: `${s}.${BASE}` })
      ).status,
    ).toBe(204);
  });

  it('an own domain only routes after DNS verification (TXT + CNAME)', async () => {
    const s = slug();
    const domain = `trade.${s}.example.com`;
    let firm = await createFirm({ name: 'Nova', slug: s, ownerEmail: uniqueEmail(), domain });
    expect(stepsOf(firm).CUSTOM_DOMAIN).toBe('WAITING:TXT_MISSING');
    expect(firm.domainSetup).toMatchObject({
      domain,
      status: 'PENDING_DNS',
      cnameTarget: `tenants.${BASE}`,
      txtName: `_dailyfunded-verify.${domain}`,
    });
    // Not routed, no certificate.
    expect((await t.http().get('/api/v1/public/firm').set('Host', domain)).body.isDefault).toBe(
      true,
    );
    expect((await t.http().get('/api/v1/internal/tls/allow').query({ domain })).status).toBe(404);
    expect((await t.http().get('/api/v1/internal/route').query({ host: domain })).status).toBe(404);

    const dns = t.app.get<FakeDnsResolver>(DNS_RESOLVER);
    dns.set('TXT', firm.domainSetup.txtName, [firm.domainSetup.txtValue]);
    let run = await t
      .http()
      .post(`/api/v1/admin/firms/${firm.id}/provisioning/run`)
      .set(bearer(token));
    firm = run.body.items.find((f: { id: string }) => f.id === firm.id);
    expect(stepsOf(firm).CUSTOM_DOMAIN).toBe('WAITING:CNAME_MISSING');

    dns.set('CNAME', domain, [`tenants.${BASE}`]);
    run = await t.http().post(`/api/v1/admin/firms/${firm.id}/provisioning/run`).set(bearer(token));
    firm = run.body.items.find((f: { id: string }) => f.id === firm.id);
    expect(stepsOf(firm).CUSTOM_DOMAIN).toBe('DONE:ACTIVE');
    expect(firm.domainStatus).toBe('ACTIVE');
    expect((await t.http().get('/api/v1/public/firm').set('Host', domain)).body.slug).toBe(s);
    expect((await t.http().get('/api/v1/internal/tls/allow').query({ domain })).status).toBe(204);

    // Changing the domain starts verification again; the old one stops routing.
    const other = `go.${s}.example.com`;
    const changed = await t
      .http()
      .post(`/api/v1/admin/firms/${firm.id}/domain`)
      .set(bearer(token))
      .send({ domain: other });
    const f2 = changed.body.items.find((f: { id: string }) => f.id === firm.id);
    expect(f2).toMatchObject({ domain: other, domainStatus: 'PENDING_DNS' });
    expect((await t.http().get('/api/v1/public/firm').set('Host', domain)).body.isDefault).toBe(
      true,
    );
  });

  it('a firm with its own database gets its own instance; the shared platform refers it there (D94)', async () => {
    const s = slug();
    const ownerEmail = uniqueEmail();
    const firm = await createFirm({
      name: 'Atlas Funding',
      slug: s,
      ownerEmail,
      dedicatedDatabase: true,
    });
    expect(stepsOf(firm)).toMatchObject({
      TENANT: 'DONE:ON_OWN_INSTANCE',
      DATABASE: 'DONE:DEDICATED_READY',
    });
    const fake = t.app.get<FakeDatabaseProvisioner>(DATABASE_PROVISIONER);
    expect(fake.created).toContain(`df_firm_${s.replace(/-/g, '_')}`);
    const seed = [...fake.seeded.values()].find((x) => x.firm.slug === s)!;
    expect(seed.firm).toMatchObject({ id: firm.id, name: 'Atlas Funding' });
    expect(seed.owner.email).toBe(ownerEmail);

    // One invite, pointing at the firm's own instance (not the shared platform).
    const mails = t.mail.sent.filter((m) => m.to === ownerEmail);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain(`https://${s}.${BASE}/`);

    const stored = await prisma.firm.findUniqueOrThrow({ where: { id: firm.id } });
    expect(stored.databaseUrlEnc).toBeTruthy();
    expect(stored.databaseUrlEnc).not.toContain('postgresql://');

    // The shared platform serves none of its traffic.
    const pub = await t.http().get('/api/v1/public/firm').set('X-Firm', s);
    expect(pub.status).toBe(421);
    expect(pub.body.code).toBe('FIRM_HOSTED_ELSEWHERE');
    const reg = await t
      .http()
      .post('/api/v1/auth/register')
      .set('X-Firm', s)
      .send({
        email: uniqueEmail(),
        password: PASSWORD,
        country: 'NL',
        locale: 'en',
        acceptTerms: true,
      });
    expect(reg.body.code).toBe('FIRM_HOSTED_ELSEWHERE');
    const scoped = await t
      .http()
      .get('/api/v1/admin/overview')
      .set(bearer(token))
      .set('X-Admin-Firm', firm.id);
    expect(scoped.body.code).toBe('FIRM_HOSTED_ELSEWHERE');
    const route = await t
      .http()
      .get('/api/v1/internal/route')
      .query({ host: `${s}.${BASE}` });
    expect(route.body).toEqual({ firm: s, instance: 'dedicated' });
  });

  it('refuses unknown or suspended hosts at the edge and logs every step', async () => {
    expect(
      (await t.http().get('/api/v1/internal/tls/allow').query({ domain: 'evil.example.org' }))
        .status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .get('/api/v1/internal/tls/allow')
          .query({ domain: `nope.${BASE}` })
      ).status,
    ).toBe(404);
    const s = slug();
    const firm = await createFirm({ name: 'Paused', slug: s, ownerEmail: uniqueEmail() });
    await t
      .http()
      .post(`/api/v1/admin/firms/${firm.id}/status`)
      .set(bearer(token))
      .send({ status: 'SUSPENDED' });
    expect(
      (
        await t
          .http()
          .get('/api/v1/internal/tls/allow')
          .query({ domain: `${s}.${BASE}` })
      ).status,
    ).toBe(404);
    const audit = await prisma.auditLog.findMany({
      where: { firmId: firm.id, action: 'platform.provisioning_step_done' },
    });
    expect(audit.map((a) => (a.data as { step: string }).step).sort()).toEqual(
      ['ADMIN', 'DATABASE', 'SUBDOMAIN', 'TENANT'].sort(),
    );
  });
});
