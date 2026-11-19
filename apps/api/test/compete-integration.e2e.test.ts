import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { PrismaService } from '../src/infra/prisma.service.js';
import { DNS_RESOLVER, type FakeDnsResolver } from '../src/infra/dns.js';
import { totp } from '../src/modules/security/totp.js';
import { SSO_AUDIENCE } from '../src/modules/compete/sso.service.js';
import { createTestApp, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
let n = 0;
const API = '/api/v1/compete';
const PLAY = 'play.dailyfunded.test';
const bearer = (tok: string) => ({ Authorization: `Bearer ${tok}` });
const slug = () => `int-${Date.now() % 1e7}-${n++}`;

/** Operator + its owner with 2FA enabled → admin token. */
async function owner(op: string): Promise<string> {
  await t.http().post(`${API}/dev/operators`).send({ slug: op, name: 'Acme Arena' });
  const email = uniqueEmail();
  const password = 'admin-password-123';
  await t.http().post(`${API}/dev/staff`).send({ email, password, operatorSlug: op });
  const login = await t.http().post(`${API}/admin/auth/login`).send({ email, password });
  const token = login.body.accessToken as string;
  const setup = await t.http().post(`${API}/admin/2fa/setup`).set(bearer(token));
  await t
    .http()
    .post(`${API}/admin/2fa/enable`)
    .set(bearer(token))
    .send({ code: totp(setup.body.secret as string) });
  return token;
}

const integration = (token: string, body: Record<string, unknown>) =>
  t
    .http()
    .put(`${API}/admin/integration`)
    .set(bearer(token))
    .send({ domain: null, logoDataUrl: null, widgetOrigins: [], ssoEnabled: false, ...body });

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

describe('compete integration: subdomain, own domain, widgets (D108)', () => {
  it('every operator is reachable on <slug>.<COMPETE_BASE_DOMAIN> and the edge knows it', async () => {
    const s = slug();
    const token = await owner(s);
    const get = await t.http().get(`${API}/admin/integration`).set(bearer(token));
    expect(get.status).toBe(200);
    expect(get.body).toMatchObject({
      subdomain: `${s}.${PLAY}`,
      playUrl: `https://${s}.${PLAY}`,
      domainStatus: 'NONE',
    });
    const op = await t.http().get(`${API}/operator`).set('Host', `${s}.${PLAY}`);
    expect(op.body.slug).toBe(s);
    const route = await t
      .http()
      .get('/api/v1/internal/route')
      .query({ host: `${s}.${PLAY}` });
    expect(route.body).toEqual({
      product: 'compete',
      operator: s,
      instance: 'shared',
      frameAncestors: [],
    });
    expect(
      (
        await t
          .http()
          .get('/api/v1/internal/tls/allow')
          .query({ domain: `${s}.${PLAY}` })
      ).status,
    ).toBe(204);
  });

  it('an own domain routes players only after TXT + CNAME verification', async () => {
    const s = slug();
    const token = await owner(s);
    const domain = `arena.${s}.example.com`;
    const set = await integration(token, { domain });
    expect(set.status).toBe(200);
    expect(set.body.domainStatus).toBe('PENDING_DNS');
    const txt = set.body.dnsRecords.find((r: { type: string }) => r.type === 'TXT');
    expect(txt.name).toBe(`_dailyfunded-verify.${domain}`);
    // Not verified: the host resolves to the default operator, no route, no certificate.
    expect((await t.http().get(`${API}/operator`).set('Host', domain)).body.slug).not.toBe(s);
    expect((await t.http().get('/api/v1/internal/route').query({ host: domain })).status).toBe(404);
    expect((await t.http().get('/api/v1/internal/tls/allow').query({ domain })).status).toBe(404);

    const dns = t.app.get<FakeDnsResolver>(DNS_RESOLVER);
    dns.set('TXT', txt.name, [txt.value]);
    dns.set('CNAME', domain, ['tenants.dailyfunded.test']);
    const v = await t.http().post(`${API}/admin/integration/domain/verify`).set(bearer(token));
    expect(v.body).toMatchObject({ domainStatus: 'ACTIVE', playUrl: `https://${domain}` });
    expect((await t.http().get(`${API}/operator`).set('Host', domain)).body.slug).toBe(s);
    expect((await t.http().get('/api/v1/internal/tls/allow').query({ domain })).status).toBe(204);

    // Changing the domain starts verification again.
    const other = `play.${s}.example.com`;
    expect((await integration(token, { domain: other })).body.domainStatus).toBe('PENDING_DNS');
    expect((await t.http().get('/api/v1/internal/route').query({ host: domain })).status).toBe(404);
  });

  it('widget origins become frame-ancestors at the edge; bad input is refused', async () => {
    const s = slug();
    const token = await owner(s);
    const ok = await integration(token, {
      widgetOrigins: ['https://www.acme-prop.com/', 'https://acme-prop.com'],
    });
    expect(ok.body.widgetOrigins).toEqual(['https://www.acme-prop.com', 'https://acme-prop.com']);
    const route = await t
      .http()
      .get('/api/v1/internal/route')
      .query({ host: `${s}.${PLAY}` });
    expect(route.body.frameAncestors).toEqual([
      'https://www.acme-prop.com',
      'https://acme-prop.com',
    ]);
    expect((await integration(token, { widgetOrigins: ['http://insecure.com'] })).status).toBe(400);
    expect((await integration(token, { domain: `x.${PLAY}` })).body.code).toBe('DOMAIN_INVALID');
    expect(
      (await integration(token, { logoDataUrl: 'data:text/html;base64,PGI+' })).body.code,
    ).toBe('LOGO_INVALID');
    const logo = 'data:image/png;base64,iVBORw0KGgo=';
    expect((await integration(token, { logoDataUrl: logo })).body.logoDataUrl).toBe(logo);
    expect(
      (await t.http().get(`${API}/operator`).set('X-Compete-Operator', s)).body.logoDataUrl,
    ).toBe(logo);
  });
});

describe('compete integration: SSO from the operator website (D109)', () => {
  async function ssoOperator() {
    const s = slug();
    const token = await owner(s);
    expect((await integration(token, { ssoEnabled: true })).body.code).toBe('SSO_SECRET_MISSING');
    const sec = await t.http().post(`${API}/admin/integration/sso/secret`).set(bearer(token));
    expect(sec.status).toBe(201);
    const secret = sec.body.secret as string;
    expect((await integration(token, { ssoEnabled: true })).body).toMatchObject({
      ssoEnabled: true,
      ssoConfigured: true,
    });
    return { s, token, secret };
  }
  const sign = (
    s: string,
    secret: string,
    sub: string,
    claims: Record<string, unknown> = {},
    exp = '2m',
  ) =>
    new SignJWT({ country: 'NL', adult: true, nickname: 'sso_trader', ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(s)
      .setAudience(SSO_AUDIENCE)
      .setSubject(sub)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(secret));
  const sso = (s: string, token: string) =>
    t.http().post(`${API}/auth/sso`).set('X-Compete-Operator', s).send({ token });

  it('creates the player once, signs in again with the same id, refuses replays', async () => {
    const { s, secret } = await ssoOperator();
    const tok = await sign(s, secret, 'user-42', { email: 'Trader@Acme-Prop.com' });
    const first = await sso(s, tok);
    expect(first.status).toBe(200);
    expect(first.body.player).toMatchObject({
      nickname: 'sso_trader',
      email: 'trader@acme-prop.com',
      sso: true,
    });
    expect(first.headers['set-cookie']?.[0]).toContain('compete_rt=');
    expect((await sso(s, tok)).body.code).toBe('SSO_REPLAYED');
    const again = await sso(s, await sign(s, secret, 'user-42', { nickname: 'renamed' }));
    expect(again.body.player.id).toBe(first.body.player.id);
    expect(again.body.player.nickname).toBe('sso_trader');
    // The session works like a normal one.
    const me = await t
      .http()
      .get(`${API}/me/round`)
      .set(bearer(again.body.accessToken as string));
    expect(me.status).toBe(200);
    // SSO-only players cannot log in with a password.
    const pw = await t
      .http()
      .post(`${API}/auth/login`)
      .set('X-Compete-Operator', s)
      .send({ email: 'trader@acme-prop.com', password: 'dummy-password-for-timing' });
    expect(pw.body.code).toBe('INVALID_CREDENTIALS');
    // Audit has the registration, no PII.
    const log = await prisma.competeAuditLog.findFirst({
      where: { action: 'compete.player.registered_sso', entityId: first.body.player.id },
    });
    expect(JSON.stringify(log?.data)).not.toContain('acme-prop');
  });

  it('refuses wrong secrets, other operators, expired tokens, minors and blocked countries', async () => {
    const { s, secret } = await ssoOperator();
    const other = await ssoOperator();
    expect((await sso(s, await sign(s, 'wrong-secret', 'u1'))).body.code).toBe('SSO_INVALID');
    // A token of operator B is useless at operator A.
    expect((await sso(s, await sign(other.s, other.secret, 'u1'))).body.code).toBe('SSO_INVALID');
    const expired = await sign(s, secret, 'u1', {}, (Math.floor(Date.now() / 1000) - 10) as never);
    expect((await sso(s, expired)).status).toBe(401);
    expect((await sso(s, await sign(s, secret, 'u2', { adult: false }))).body.code).toBe(
      'ADULT_REQUIRED',
    );
    expect((await sso(s, await sign(s, secret, 'u3', { country: 'KP' }))).body.code).toBe(
      'COUNTRY_RESTRICTED',
    );
    // Nickname collisions get a suffix instead of failing.
    const a = await sso(s, await sign(s, secret, 'u4', { nickname: 'same_name' }));
    const b = await sso(s, await sign(s, secret, 'u5', { nickname: 'same_name' }));
    expect(a.body.player.nickname).toBe('same_name');
    expect(b.body.player.nickname).toMatch(/^same_name_\d+$/);
  });

  it('is off until the operator enables it; a new secret invalidates old tokens', async () => {
    const s = slug();
    await owner(s);
    expect(
      (await t.http().post(`${API}/auth/sso`).set('X-Compete-Operator', s).send({ token: 'x' }))
        .body.code,
    ).toBe('SSO_DISABLED');
    const { s: s2, token, secret } = await ssoOperator();
    await t.http().post(`${API}/admin/integration/sso/secret`).set(bearer(token));
    expect((await sso(s2, await sign(s2, secret, 'u9'))).body.code).toBe('SSO_INVALID');
  });
});
