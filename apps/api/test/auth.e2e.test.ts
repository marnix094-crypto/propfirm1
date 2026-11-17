import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, uniqueEmail, type TestApp } from './app.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

const refreshCookie = (cookies: string[]) =>
  cookies.find((c) => c.startsWith('brand_rt='))!.split(';')[0]!;

describe('auth', () => {
  it('registers a trader with a $100,000 demo account and a secure refresh cookie', async () => {
    const { token, accountId, cookie } = await registerUser(t);
    const acc = await t
      .http()
      .get(`/api/v1/accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(acc.status).toBe(200);
    expect(acc.body).toMatchObject({
      kind: 'DEMO',
      isSimulated: true,
      balanceMinor: '10000000',
      equityMinor: '10000000',
    });
    const c = cookie.find((x) => x.startsWith('brand_rt='))!;
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('rejects duplicate email, weak password, missing terms and restricted countries', async () => {
    const email = uniqueEmail();
    const body = {
      email,
      password: 'correct-horse-battery',
      country: 'NL',
      locale: 'en',
      acceptTerms: true,
    };
    expect((await t.http().post('/api/v1/auth/register').send(body)).status).toBe(201);
    const dup = await t.http().post('/api/v1/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    expect(dup.headers['content-type']).toContain('application/problem+json');

    const weak = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ ...body, email: uniqueEmail(), password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');

    const terms = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ ...body, email: uniqueEmail(), acceptTerms: false });
    expect(terms.status).toBe(400);

    const blocked = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ ...body, email: uniqueEmail(), country: 'KP' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('COUNTRY_RESTRICTED');
  });

  it('logs in, and rejects wrong passwords with a generic error', async () => {
    const { email } = await registerUser(t);
    const bad = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password-123' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const unknown = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail(), password: 'whatever-123456' });
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    const ok = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: email.toUpperCase(), password: 'correct-horse-battery' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const { cookie } = await registerUser(t);
    const first = refreshCookie(cookie);
    const r1 = await t.http().post('/api/v1/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    const second = refreshCookie(r1.headers['set-cookie'] as unknown as string[]);
    expect(second).not.toBe(first);

    const reuse = await t.http().post('/api/v1/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_REUSED');
    // The legitimate newer token is revoked as well.
    const after = await t.http().post('/api/v1/auth/refresh').set('Cookie', second);
    expect(after.status).toBe(401);
  });

  it('rate-limits login attempts (5 per minute)', async () => {
    process.env.TEST_THROTTLE = 'true';
    try {
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) {
        codes.push(
          (
            await t
              .http()
              .post('/api/v1/auth/login')
              .send({ email: 'nobody@example.com', password: 'whatever-123456' })
          ).status,
        );
      }
      expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    } finally {
      delete process.env.TEST_THROTTLE;
    }
  });

  it('protects private routes', async () => {
    expect((await t.http().get('/api/v1/accounts')).status).toBe(401);
    expect(
      (await t.http().get('/api/v1/accounts').set('Authorization', 'Bearer nope')).body.code,
    ).toBe('TOKEN_INVALID');
    expect((await t.http().get('/api/v1/health')).status).toBe(200);
  });
});
