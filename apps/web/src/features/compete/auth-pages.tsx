import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { countryOptions } from '@/lib/countries';
import { ApiError } from '@/lib/api';
import { nextQuery, safeNext } from '@/lib/safe-next';
import { competeCall, competeClient, operatorSlug } from './api';
import { useCompeteSession } from './session';
import { useCompeteOperator } from './hooks';

export function useCompeteError() {
  const { t } = useTranslation('compete');
  return (err: unknown) =>
    err instanceof ApiError
      ? t(`errors.${err.code}`, { defaultValue: t('errors.generic') })
      : t('errors.generic');
}

function AuthCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:py-24">
      <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{sub}</p>
      <Card className="glow-card mt-8" padding="lg">
        {children}
      </Card>
    </div>
  );
}

export function CompeteLoginPage() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toMessage = useCompeteError();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await competeCall(() =>
        competeClient.POST('/api/v1/compete/auth/login', {
          body: { email: String(f.get('email')), password: String(f.get('password')) },
        }),
      );
      useCompeteSession.getState().setSession(r);
      const dest = safeNext(next, lang, 'compete');
      navigate(dest === `/${lang}/compete` ? `/${lang}/compete/app` : dest, { replace: true });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const op = useCompeteOperator();
  return (
    <AuthCard title={t('auth.loginTitle')} sub={t('auth.loginSub')}>
      {op.data?.ssoEnabled && (
        <p className="mb-5 rounded-[12px] border border-border bg-card-muted/60 p-3 text-sm text-muted">
          {t('sso.loginHint', { firm: op.data.name })}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate={false}>
        <Input label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Input
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} fullWidth>
          {t('auth.login')}
        </Button>
        <p className="text-center text-sm text-muted">
          {t('auth.noAccount')}{' '}
          <Link
            to={`/${lang}/compete/register${nextQuery(next)}`}
            className="font-semibold text-link hover:underline"
          >
            {t('auth.register')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function CompeteRegisterPage() {
  const { t, i18n } = useTranslation('compete');
  const { lang } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toMessage = useCompeteError();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await competeCall(() =>
        competeClient.POST('/api/v1/compete/auth/register', {
          body: {
            email: String(f.get('email')),
            password: String(f.get('password')),
            nickname: String(f.get('nickname')),
            country: String(f.get('country')),
            locale: i18n.language as 'en' | 'nl' | 'es',
            acceptTerms: f.get('terms') === 'on',
            confirmAdult: f.get('adult') === 'on',
          },
        }),
      );
      useCompeteSession.getState().setSession(r);
      const dest = safeNext(next, lang, 'compete');
      navigate(dest === `/${lang}/compete` ? `/${lang}/compete/app` : dest, { replace: true });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t('auth.registerTitle')} sub={t('auth.registerSub')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Input
          label={t('auth.nickname')}
          name="nickname"
          autoComplete="nickname"
          required
          pattern="[A-Za-z0-9_]{3,20}"
          hint={t('auth.nicknameHint')}
        />
        <Input
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          hint={t('auth.passwordHint')}
        />
        <Select label={t('auth.country')} name="country" defaultValue="NL" required>
          {countryOptions(i18n.language).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="adult"
            required
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>{t('auth.adult')}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="terms"
            required
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>{t('auth.terms')}</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} fullWidth>
          {t('auth.createAccount')}
        </Button>
        <p className="text-center text-sm text-muted">
          {t('auth.haveAccount')}{' '}
          <Link
            to={`/${lang}/compete/login${nextQuery(next)}`}
            className="font-semibold text-link hover:underline"
          >
            {t('auth.login')}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

/**
 * Landing page of the single sign-on link from the operator's website (D109):
 * `/{lang}/compete/sso#token=…` (fragment, so the token never reaches server logs).
 */
export function CompeteSsoPage() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  const navigate = useNavigate();
  const toMessage = useCompeteError();
  // Read the token once and remove it from the address bar and history straight away.
  const [link] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const v = {
      token: hash.get('token') ?? query.get('token'),
      next: hash.get('next') ?? query.get('next'),
    };
    operatorSlug(); // keeps a `?operator=` preview override before the query is removed
    window.history.replaceState(null, '', window.location.pathname);
    return v;
  });
  const [error, setError] = useState<string | null>(link.token ? null : t('errors.SSO_INVALID'));
  const started = useRef(false);

  useEffect(() => {
    const { token, next } = link;
    if (started.current || !token) return;
    started.current = true;
    void (async () => {
      try {
        const r = await competeCall(() =>
          competeClient.POST('/api/v1/compete/auth/sso', { body: { token } }),
        );
        useCompeteSession.getState().setSession(r);
        const dest = safeNext(next, lang, 'compete');
        navigate(dest === `/${lang}/compete` ? `/${lang}/compete/app` : dest, { replace: true });
      } catch (err) {
        setError(toMessage(err));
      }
    })();
  }, [lang, link, navigate, toMessage]);

  return (
    <AuthCard title={t('sso.title')} sub={error ? t('sso.failedSub') : t('sso.sub')}>
      {error ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
          <Button asChild fullWidth>
            <Link to={`/${lang}/compete/login`}>{t('auth.login')}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 text-sm text-muted" role="status">
          <span
            className="size-5 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t('sso.working')}
        </div>
      )}
    </AuthCard>
  );
}
