import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { ApiError } from '@/lib/api';
import { useSession } from '@/stores/session';
import { AuthLayout } from './auth-layout';
import { GuestOnly } from './require-auth';

/** Only allow in-app redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null, lang: string | undefined): string {
  return next && next.startsWith(`/${lang}/app`) && !next.startsWith('//') ? next : `/${lang}/app`;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[14px] bg-[color-mix(in_srgb,var(--loss)_10%,transparent)] px-3.5 py-2.5 text-sm font-medium text-[var(--badge-danger-fg)]"
    >
      {children}
    </p>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);

  const done = (res: Parameters<typeof setSession>[0]) => {
    setSession(res);
    void navigate(safeNext(params.get('next'), lang), { replace: true });
  };

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await call(() =>
        client.POST('/api/v1/auth/login', {
          body: { email: String(form.get('email')), password: String(form.get('password')) },
        }),
      );
      if (res.mfaRequired && res.mfaToken) setMfaToken(res.mfaToken);
      else if (res.accessToken && res.user && res.expiresIn)
        done({ accessToken: res.accessToken, expiresIn: res.expiresIn, user: res.user });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function onMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('code')).trim();
    setBusy(true);
    setError(null);
    try {
      const res = await call(() =>
        client.POST('/api/v1/auth/2fa/verify', {
          body: {
            mfaToken: mfaToken!,
            ...(useRecovery ? { recoveryCode: value } : { code: value.replace(/\s/g, '') }),
          },
        }),
      );
      done(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_TOKEN_INVALID') setMfaToken(null);
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  if (mfaToken) {
    return (
      <GuestOnly>
        <AuthLayout title={t('auth.mfa.title')} subtitle={t('auth.mfa.subtitle')}>
          <form
            onSubmit={(e) => void onMfa(e)}
            className="flex flex-col gap-4"
            key={useRecovery ? 'r' : 'c'}
          >
            {useRecovery ? (
              <Input
                label={t('auth.mfa.recovery')}
                name="code"
                autoComplete="off"
                required
                autoFocus
                placeholder="xxxx-xxxx"
              />
            ) : (
              <Input
                label={t('auth.mfa.code')}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="123456"
                className="[&_input]:text-center [&_input]:text-xl [&_input]:tracking-[0.4em]"
              />
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" size="lg" fullWidth disabled={busy}>
              {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
              {t('auth.mfa.submit')}
            </Button>
            <button
              type="button"
              onClick={() => setUseRecovery((v) => !v)}
              className="text-sm font-semibold text-link hover:underline"
            >
              {useRecovery ? t('auth.mfa.useCode') : t('auth.mfa.useRecovery')}
            </button>
          </form>
        </AuthLayout>
      </GuestOnly>
    );
  }

  return (
    <GuestOnly>
      <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
        <form onSubmit={(e) => void onLogin(e)} className="flex flex-col gap-4">
          <Input
            label={t('auth.email')}
            name="email"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
          />
          <div>
            <Input
              label={t('auth.password')}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Link
              to={`/${lang}/forgot-password`}
              className="mt-2 inline-block text-sm font-semibold text-link hover:underline"
            >
              {t('auth.forgotLink')}
            </Link>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
            {t('auth.login.submit')}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {t('auth.login.noAccount')}{' '}
          <Link to={`/${lang}/register`} className="font-semibold text-link hover:underline">
            {t('auth.login.registerLink')}
          </Link>
        </p>
      </AuthLayout>
    </GuestOnly>
  );
}
