import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { adminCall, adminClient, useCompeteAdmin } from './api';
import { PageTitle, useAdminError } from './ui';

function Shell({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <p className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
        Compete · admin
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{sub}</p>
      <Card className="mt-8" padding="lg">
        {children}
      </Card>
    </main>
  );
}

export function CompeteAdminLoginPage() {
  const { t } = useTranslation('competeAdmin');
  const { lang } = useParams();
  const navigate = useNavigate();
  const toMessage = useAdminError();
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const code = String(f.get('code') ?? '').trim();
      const r = await adminCall(() =>
        adminClient.POST('/api/v1/compete/admin/auth/login', {
          body: {
            email: String(f.get('email')),
            password: String(f.get('password')),
            ...(code ? { code } : {}),
          },
        }),
      );
      useCompeteAdmin.getState().setSession(r);
      navigate(
        r.staff.twoFactorRequired ? `/${lang}/compete/admin/security` : `/${lang}/compete/admin`,
        { replace: true },
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') setNeedCode(true);
      else setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={t('login.title')} sub={t('login.sub')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input
          label={t('login.email')}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
        <Input
          label={t('login.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {needCode && (
          <Input
            label={t('login.code')}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
            autoFocus
            hint={t('login.codeHint')}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} fullWidth>
          {t('login.submit')}
        </Button>
        <p className="text-center text-xs text-muted">{t('login.note')}</p>
      </form>
    </Shell>
  );
}

export function CompeteAdminSetupPage() {
  const { t } = useTranslation('competeAdmin');
  const { lang } = useParams();
  const [params] = useSearchParams();
  const toMessage = useAdminError();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirm')) return setError(t('setup.mismatch'));
    setError(null);
    try {
      await adminCall(() =>
        adminClient.POST('/api/v1/compete/admin/auth/setup', {
          body: { token: params.get('token') ?? '', password: String(f.get('password')) },
        }),
      );
      setDone(true);
    } catch (err) {
      setError(toMessage(err));
    }
  }

  return (
    <Shell title={t('setup.title')} sub={t('setup.sub')}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p role="status">{t('setup.done')}</p>
          <Button asChild>
            <Link to={`/${lang}/compete/admin/login`}>{t('login.submit')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label={t('setup.password')}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            hint={t('setup.hint')}
          />
          <Input
            label={t('setup.confirm')}
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
          <Button type="submit" fullWidth>
            {t('setup.submit')}
          </Button>
        </form>
      )}
    </Shell>
  );
}

/** 2FA setup (required before the panel opens unless disabled in dev). */
export function CompeteAdminSecurityPage() {
  const { t } = useTranslation('competeAdmin');
  const { lang } = useParams();
  const navigate = useNavigate();
  const toMessage = useAdminError();
  const staff = useCompeteAdmin((s) => s.staff);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setup) void QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220 }).then(setQr);
  }, [setup]);

  const start = async () => {
    setError(null);
    try {
      setSetup(await adminCall(() => adminClient.POST('/api/v1/compete/admin/2fa/setup')));
    } catch (err) {
      setError(toMessage(err));
    }
  };
  const enable = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    setError(null);
    try {
      await adminCall(() =>
        adminClient.POST('/api/v1/compete/admin/2fa/enable', { body: { code } }),
      );
      const me = await adminCall(() => adminClient.GET('/api/v1/compete/admin/me'));
      useCompeteAdmin.getState().setStaff(me);
      navigate(`/${lang}/compete/admin`, { replace: true });
    } catch (err) {
      setError(toMessage(err));
    }
  };

  return (
    <>
      <PageTitle title={t('security.title')} sub={t('security.sub')} />
      <Card padding="lg" className="max-w-xl">
        {staff?.twoFactorEnabled ? (
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
            {t('security.enabled')}
          </p>
        ) : !setup ? (
          <div className="flex flex-col gap-4">
            {staff?.twoFactorRequired && (
              <p
                role="status"
                className="rounded-[12px] border border-border bg-card-muted p-3 text-sm"
              >
                {t('security.required')}
              </p>
            )}
            <Button onClick={() => void start()}>{t('security.start')}</Button>
          </div>
        ) : (
          <form onSubmit={enable} className="flex flex-col gap-4">
            <p className="text-sm">{t('security.scan')}</p>
            {qr && (
              <img
                src={qr}
                alt={t('security.qrAlt')}
                width={220}
                height={220}
                className="rounded-[12px] bg-white p-2"
              />
            )}
            <p className="text-xs break-all text-muted">
              {t('security.manual')} <code className="font-mono">{setup.secret}</code>
            </p>
            <Input
              label={t('login.code')}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
            />
            <Button type="submit">{t('security.enable')}</Button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-loss">
            {error}
          </p>
        )}
      </Card>
    </>
  );
}
