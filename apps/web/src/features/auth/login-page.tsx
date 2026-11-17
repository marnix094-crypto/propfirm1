import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { AuthLayout } from './auth-layout';
import { GuestOnly } from './require-auth';

/** Only allow in-app redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null, lang: string | undefined): string {
  return next && next.startsWith(`/${lang}/app`) && !next.startsWith('//') ? next : `/${lang}/app`;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
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
      setSession(res);
      void navigate(safeNext(params.get('next'), lang), { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GuestOnly>
      <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate={false}>
          <Input
            label={t('auth.email')}
            name="email"
            type="email"
            autoComplete="email"
            required
            inputMode="email"
          />
          <Input
            label={t('auth.password')}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && (
            <p
              role="alert"
              className="rounded-[14px] bg-[color-mix(in_srgb,var(--loss)_10%,transparent)] px-3.5 py-2.5 text-sm font-medium text-[var(--badge-danger-fg)]"
            >
              {error}
            </p>
          )}
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
