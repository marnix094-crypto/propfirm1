import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { AuthLayout } from './auth-layout';
import { ErrorNote } from './login-page';

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div role="status" className="flex items-start gap-3 rounded-[16px] bg-card-muted p-4 text-sm">
      <Icon
        className={ok ? 'size-5 shrink-0 text-accent' : 'size-5 shrink-0 text-loss'}
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(() =>
        client.POST('/api/v1/auth/password/forgot', {
          body: { email: String(new FormData(e.currentTarget).get('email')) },
        }),
      );
      setSent(true);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      {sent ? (
        <div className="flex flex-col gap-5">
          <div
            role="status"
            className="flex items-start gap-3 rounded-[16px] bg-card-muted p-4 text-sm"
          >
            <MailCheck className="size-5 shrink-0 text-accent" aria-hidden="true" />
            <p>{t('auth.forgot.sent')}</p>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <Input
            label={t('auth.email')}
            name="email"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to={`/${lang}/login`} className="font-semibold text-link hover:underline">
          {t('auth.forgot.back')}
        </Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(() =>
        client.POST('/api/v1/auth/password/reset', {
          body: { token, password: String(new FormData(e.currentTarget).get('password')) },
        }),
      );
      setDone(true);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      {done ? (
        <div className="flex flex-col gap-5">
          <Notice ok>{t('auth.reset.done')}</Notice>
          <Button asChild size="lg" fullWidth>
            <Link to={`/${lang}/login`}>{t('auth.login.submit')}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <Input
            label={t('app.security.password.new')}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            hint={t('auth.register.passwordHint')}
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" size="lg" fullWidth disabled={busy || !token}>
            {busy && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Opened from the email link; works signed in or out. */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'busy' | 'ok' | 'failed'>('busy');
  const updateUser = useSession((s) => s.updateUser);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; the token is single-use
    started.current = true;
    call(() => client.POST('/api/v1/auth/verify-email', { body: { token } }))
      .then(() => {
        setState('ok');
        updateUser({ emailVerified: true });
      })
      .catch(() => setState('failed'));
  }, [token, updateUser]);

  return (
    <AuthLayout title={t('auth.verify.title')} subtitle="">
      <div className="flex flex-col gap-5" aria-live="polite">
        {state === 'busy' && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />{' '}
            {t('auth.verify.verifying')}
          </p>
        )}
        {state === 'ok' && <Notice ok>{t('auth.verify.success')}</Notice>}
        {state === 'failed' && <Notice ok={false}>{t('auth.verify.failed')}</Notice>}
        {state !== 'busy' && (
          <Button asChild size="lg" fullWidth>
            <Link to={`/${lang}/app`}>{t('auth.verify.toApp')}</Link>
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
