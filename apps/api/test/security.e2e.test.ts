import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma.service.js';
import { totp } from '../src/modules/security/totp.js';
import { createTestApp, registerUser, type TestApp } from './app.js';

let t: TestApp;
let prisma: PrismaService;
const password = 'correct-horse-battery';

beforeAll(async () => {
  t = await createTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.app.close();
});

const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;
const rt = (cookies: string[]) => cookies.find((c) => c.startsWith('brand_rt='))!.split(';')[0]!;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
/** Allow another code in the same 30 s window (tests only): forget the last used step. */
const forgetStep = (email: string) =>
  prisma.twoFactor.updateMany({ where: { user: { email } }, data: { lastUsedStep: null } });

describe('email verification', () => {
  it('sends a localized link on signup; the token verifies once', async () => {
    const u = await registerUser(t);
    const mail = t.mail.last(u.email)!;
    expect(mail.subject).toBe('Bevestig je e-mailadres'); // locale nl
    expect(mail.text).toContain('http://localhost:5173/nl/verify-email?token=');
    expect((await t.http().get('/api/v1/me').set(bearer(u.token))).body.emailVerified).toBe(false);

    const token = tokenFrom(mail.text);
    expect((await t.http().post('/api/v1/auth/verify-email').send({ token })).status).toBe(204);
    expect((await t.http().get('/api/v1/me').set(bearer(u.token))).body.emailVerified).toBe(true);
    const again = await t.http().post('/api/v1/auth/verify-email').send({ token });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('TOKEN_INVALID');
  });

  it('resend invalidates the previous link', async () => {
    const u = await registerUser(t);
    const first = tokenFrom(t.mail.last(u.email)!.text);
    expect(
      (await t.http().post('/api/v1/auth/verify-email/resend').set(bearer(u.token))).status,
    ).toBe(204);
    const second = tokenFrom(t.mail.last(u.email)!.text);
    expect(second).not.toBe(first);
    expect((await t.http().post('/api/v1/auth/verify-email').send({ token: first })).status).toBe(
      422,
    );
    expect((await t.http().post('/api/v1/auth/verify-email').send({ token: second })).status).toBe(
      204,
    );
  });
});

describe('password reset', () => {
  it('does not reveal whether an email exists', async () => {
    const before = t.mail.sent.length;
    const r = await t
      .http()
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'nobody-here@example.com' });
    expect(r.status).toBe(204);
    expect(t.mail.sent.length).toBe(before);
  });

  it('resets the password once and signs out every session', async () => {
    const u = await registerUser(t);
    await t.http().post('/api/v1/auth/password/forgot').send({ email: u.email });
    const token = tokenFrom(t.mail.last(u.email)!.text);
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/password/reset')
          .send({ token, password: 'a-brand-new-passphrase' })
      ).status,
    ).toBe(204);
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/password/reset')
          .send({ token, password: 'another-passphrase-1' })
      ).status,
    ).toBe(422);
    expect((await t.http().post('/api/v1/auth/refresh').set('Cookie', rt(u.cookie))).status).toBe(
      401,
    );
    expect(
      (await t.http().post('/api/v1/auth/login').send({ email: u.email, password })).status,
    ).toBe(401);
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/login')
          .send({ email: u.email, password: 'a-brand-new-passphrase' })
      ).status,
    ).toBe(200);
  });
});

describe('two-factor authentication', () => {
  it('setup → enable → login needs a code → recovery codes work once → disable', async () => {
    const u = await registerUser(t);
    const setup = await t.http().post('/api/v1/me/2fa/setup').set(bearer(u.token));
    expect(setup.status).toBe(200);
    const { secret, otpauthUri } = setup.body;
    expect(otpauthUri).toContain(`secret=${secret}`);
    const stored = await prisma.twoFactor.findFirst({ where: { user: { email: u.email } } });
    expect(stored!.secretEnc).not.toContain(secret); // encrypted at rest

    expect(
      (await t.http().post('/api/v1/me/2fa/enable').set(bearer(u.token)).send({ code: '000000' }))
        .body.code,
    ).toBe('TWO_FACTOR_CODE_INVALID');
    const enabled = await t
      .http()
      .post('/api/v1/me/2fa/enable')
      .set(bearer(u.token))
      .send({ code: totp(secret) });
    expect(enabled.status).toBe(200);
    const codes: string[] = enabled.body.recoveryCodes;
    expect(codes).toHaveLength(10);
    expect((await t.http().get('/api/v1/me').set(bearer(u.token))).body.twoFactorEnabled).toBe(
      true,
    );

    // Password step now returns an MFA challenge instead of tokens (and no cookie).
    const login = await t.http().post('/api/v1/auth/login').send({ email: u.email, password });
    expect(login.body).toMatchObject({ mfaRequired: true });
    expect(login.body.accessToken).toBeUndefined();
    expect(login.headers['set-cookie']).toBeUndefined();
    // The MFA token is not an access token.
    expect((await t.http().get('/api/v1/me').set(bearer(login.body.mfaToken))).status).toBe(401);

    // Same step as enable → replay rejected.
    const replay = await t
      .http()
      .post('/api/v1/auth/2fa/verify')
      .send({ mfaToken: login.body.mfaToken, code: totp(secret) });
    expect(replay.status).toBe(401);
    await forgetStep(u.email);
    const ok = await t
      .http()
      .post('/api/v1/auth/2fa/verify')
      .send({ mfaToken: login.body.mfaToken, code: totp(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    // Recovery code: works once, case/format-insensitive.
    const l2 = await t.http().post('/api/v1/auth/login').send({ email: u.email, password });
    const rc = codes[0]!.toUpperCase().replace('-', ' ');
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/2fa/verify')
          .send({ mfaToken: l2.body.mfaToken, recoveryCode: rc })
      ).status,
    ).toBe(200);
    const l3 = await t.http().post('/api/v1/auth/login').send({ email: u.email, password });
    expect(
      (
        await t
          .http()
          .post('/api/v1/auth/2fa/verify')
          .send({ mfaToken: l3.body.mfaToken, recoveryCode: codes[0] })
      ).status,
    ).toBe(401);

    // Disable needs password AND a code.
    await forgetStep(u.email);
    expect(
      (
        await t
          .http()
          .post('/api/v1/me/2fa/disable')
          .set(bearer(u.token))
          .send({ password: 'wrong-password-x', code: totp(secret) })
      ).body.code,
    ).toBe('PASSWORD_INCORRECT');
    await forgetStep(u.email);
    expect(
      (
        await t
          .http()
          .post('/api/v1/me/2fa/disable')
          .set(bearer(u.token))
          .send({ password, code: totp(secret) })
      ).status,
    ).toBe(204);
    expect(
      (await t.http().post('/api/v1/auth/login').send({ email: u.email, password })).body
        .accessToken,
    ).toBeTruthy();

    const actions = (await prisma.auditLog.findMany({ where: { actorId: stored!.userId } })).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'user.2fa_enabled',
        'user.2fa_recovery_code_used',
        'user.2fa_disabled',
      ]),
    );
  });
});

describe('sessions and password change', () => {
  it('lists sessions, revokes one, and a password change signs out other devices', async () => {
    const u = await registerUser(t);
    const second = await t
      .http()
      .post('/api/v1/auth/login')
      .set('User-Agent', 'SecondDevice/1.0')
      .send({ email: u.email, password });
    const secondCookie = rt(second.headers['set-cookie'] as unknown as string[]);
    const third = await t
      .http()
      .post('/api/v1/auth/login')
      .set('User-Agent', 'ThirdDevice/1.0')
      .send({ email: u.email, password });
    const thirdCookie = rt(third.headers['set-cookie'] as unknown as string[]);

    const list = await t
      .http()
      .get('/api/v1/me/sessions')
      .set(bearer(u.token))
      .set('Cookie', rt(u.cookie));
    expect(list.body).toHaveLength(3);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const thirdSession = list.body.find(
      (s: { userAgent: string }) => s.userAgent === 'ThirdDevice/1.0',
    );
    expect(
      (await t.http().delete(`/api/v1/me/sessions/${thirdSession.id}`).set(bearer(u.token))).status,
    ).toBe(204);
    expect((await t.http().post('/api/v1/auth/refresh').set('Cookie', thirdCookie)).status).toBe(
      401,
    );

    const wrong = await t
      .http()
      .post('/api/v1/me/password')
      .set(bearer(u.token))
      .set('Cookie', rt(u.cookie))
      .send({ currentPassword: 'nope-nope-nope', newPassword: 'new-passphrase-123' });
    expect(wrong.body.code).toBe('PASSWORD_INCORRECT');
    const changed = await t
      .http()
      .post('/api/v1/me/password')
      .set(bearer(u.token))
      .set('Cookie', rt(u.cookie))
      .send({ currentPassword: password, newPassword: 'new-passphrase-123' });
    expect(changed.status).toBe(204);
    expect((await t.http().post('/api/v1/auth/refresh').set('Cookie', secondCookie)).status).toBe(
      401,
    ); // other device out
    expect((await t.http().post('/api/v1/auth/refresh').set('Cookie', rt(u.cookie))).status).toBe(
      200,
    ); // this device stays
  });
});
