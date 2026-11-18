import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { SkipLink } from '@/components/layout/skip-link';
import { useCompeteOperator } from './hooks';
import { useCompeteSession } from './session';

/** Restores the player session once (refresh cookie) when a compete page opens. */
function useBootSession() {
  const status = useCompeteSession((s) => s.status);
  useEffect(() => {
    if (status === 'unknown') void useCompeteSession.getState().refresh();
  }, [status]);
}

/** Wordmark of the operator (white label: name from the operator config). */
export function ArenaMark({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
      <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-primary text-[var(--btn-primary-fg)]">
        <Trophy className="size-4" aria-hidden="true" />
      </span>
      {name}
    </span>
  );
}

/**
 * Shell of the Compete product (D97/D103): own header, footer and session. It lives on the
 * Daily Funded website under /{lang}/compete but shares nothing with the prop-firm platform.
 */
export function CompeteLayout() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  useBootSession();
  const op = useCompeteOperator();
  const status = useCompeteSession((s) => s.status);
  const name = op.data?.name ?? 'Arena';
  const base = `/${lang}/compete`;

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <div className="border-b border-border bg-card-muted px-4 py-2 text-center text-xs text-muted">
        <FlaskConical className="mr-1.5 inline size-3.5 text-accent" aria-hidden="true" />
        {t('banner', { firm: name })}{' '}
        <Link
          to={`/${lang}`}
          className="font-semibold text-link underline-offset-2 hover:underline"
        >
          {t('bannerLink')}
        </Link>
      </div>
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to={base} className="rounded-sm" aria-label={t('nav.home', { firm: name })}>
            <ArenaMark name={name} />
          </Link>
          <nav aria-label={t('nav.label')} className="ml-6 hidden md:block">
            <ul className="flex items-center gap-1 text-sm font-medium">
              {(['how', 'prizes', 'results'] as const).map((k) => (
                <li key={k}>
                  <Link
                    to={`${base}#${k}`}
                    className="rounded-sm px-3 py-2 text-muted transition-colors hover:text-fg"
                  >
                    {t(`nav.${k}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <ThemeToggle />
            {status === 'authenticated' ? (
              <Button size="sm" asChild>
                <Link to={`${base}/app`}>{t('nav.dashboard')}</Link>
              </Button>
            ) : (
              <>
                <Link
                  to={`${base}/login`}
                  className="hidden rounded-sm px-2 py-2 text-sm font-medium text-muted hover:text-fg sm:inline"
                >
                  {t('nav.login')}
                </Link>
                <Button size="sm" asChild>
                  <Link to={`${base}/register`}>{t('nav.join')}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-10 text-sm text-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 sm:px-6">
          <ArenaMark name={name} />
          <p className="max-w-3xl">{t('footer.disclaimer')}</p>
          <p className="max-w-3xl">{t('footer.responsible')}</p>
          <p>
            {t('footer.poweredBy')}{' '}
            <Link to={`/${lang}`} className="font-semibold text-link hover:underline">
              Daily Funded
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Player-only routes; waits for the session restore, then redirects anonymous visitors. */
export function RequireCompeteAuth({ children }: { children: ReactNode }) {
  const status = useCompeteSession((s) => s.status);
  const { lang } = useParams();
  const loc = useLocation();
  if (status === 'unknown') return <div className="min-h-[60vh]" aria-busy="true" />;
  if (status === 'anonymous')
    return (
      <Navigate to={`/${lang}/compete/login?next=${encodeURIComponent(loc.pathname)}`} replace />
    );
  return <>{children}</>;
}
