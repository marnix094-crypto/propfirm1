import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { nextQuery, safeNext } from '@/lib/safe-next';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { INTL_LOCALE, isLocale, type Locale } from '@brand/shared';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { call, client } from '@/lib/api-client';
import { countryOptions } from '@/lib/countries';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { AuthLayout } from './auth-layout';
import { GuestOnly } from './require-auth';

export function RegisterPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useSession((s) => s.setSession);
  const locale: Locale = isLocale(lang) ? lang : 'en';
  const countries = useMemo(() => countryOptions(INTL_LOCALE[locale]), [locale]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await call(() =>
        client.POST('/api/v1/auth/register', {
          body: {
            email: String(f.get('email')),
            password: String(f.get('password')),
            country: String(f.get('country')),
            locale,
            acceptTerms: f.get('terms') === 'on',
          },
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
      <AuthLayout title={t('auth.register.title')} subtitle={t('auth.register.subtitle')}>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
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
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            hint={t('auth.register.passwordHint')}
          />
          <Select
            label={t('auth.register.country')}
            name="country"
            required
            defaultValue=""
            autoComplete="country"
          >
            <option value="" disabled>
              {t('auth.register.countryPlaceholder')}
            </option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="terms"
              required
              className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
            />
            <span>
              {t('auth.register.terms')}{' '}
              <span className="text-muted">
                (
                <Link to={`/${lang}/legal/terms`} target="_blank" className="text-link underline">
                  {t('auth.register.readTerms')}
                </Link>
                ,{' '}
                <Link to={`/${lang}/legal/risk`} target="_blank" className="text-link underline">
                  {t('auth.register.readRisk')}
                </Link>
                )
              </span>
            </span>
          </label>
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
            {t('auth.register.submit')}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted">
          {t('auth.register.haveAccount')}{' '}
          <Link
            to={`/${lang}/login${nextQuery(params.get('next'))}`}
            className="font-semibold text-link hover:underline"
          >
            {t('auth.register.loginLink')}
          </Link>
        </p>
      </AuthLayout>
    </GuestOnly>
  );
}
