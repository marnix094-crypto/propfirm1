import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlaskConical, LogOut, Trophy } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOperatorTheme } from './arena-ui';
import { competeRealtime } from './realtime';
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

/** Scrolls to `#id` after navigation (sections may render after data loads). */
function useHashScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const id = decodeURIComponent(hash.slice(1));
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 20) {
        clearInterval(t);
        el?.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }
    }, 50);
    return () => clearInterval(t);
  }, [pathname, hash]);
}

/** Signed-in player: nickname chip + log out. */
function PlayerChip() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const player = useCompeteSession((s) => s.player);
  const logout = async () => {
    competeRealtime.disconnect();
    await useCompeteSession.getState().logout();
    qc.removeQueries({ queryKey: ['compete'] });
    navigate(`/${lang}/compete`);
  };
  const nick = player?.nickname ?? '';
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/70 py-1 pr-1 pl-1">
      <span
        aria-hidden="true"
        className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-[var(--btn-primary-fg)] uppercase"
      >
        {nick.slice(0, 2)}
      </span>
      <span className="hidden max-w-[10rem] truncate px-1.5 text-sm font-semibold sm:inline">
        {nick}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-card-muted hover:text-fg"
        aria-label={t('nav.logout')}
        title={t('nav.logout')}
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Shell of the Compete product (D97/D103/D107): own header, footer and session, in the
 * operator's name and brand colour. Shares nothing with the prop-firm platform.
 */
export function CompeteLayout() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  useBootSession();
  useHashScroll();
  const op = useCompeteOperator();
  useOperatorTheme(op.data?.primaryColor);
  const status = useCompeteSession((s) => s.status);
  const authed = status === 'authenticated';
  const name = op.data?.name ?? 'Arena';
  const base = `/${lang}/compete`;
  const links = authed
    ? [
        { to: `${base}/app`, label: t('nav.arena'), end: true },
        { to: `${base}/app#history`, label: t('nav.myRounds') },
        { to: `${base}#rules`, label: t('nav.rules') },
      ]
    : [
        { to: `${base}#how`, label: t('nav.how') },
        { to: `${base}#prizes`, label: t('nav.prizes') },
        { to: `${base}#results`, label: t('nav.results') },
      ];

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <div className="border-b border-border bg-card-muted px-4 py-1.5 text-center text-xs text-muted">
        <FlaskConical className="mr-1.5 inline size-3.5 text-accent" aria-hidden="true" />
        {t('banner', { firm: name })}{' '}
        <Link
          to={`/${lang}`}
          className="font-semibold text-link underline-offset-2 hover:underline"
        >
          {t('bannerLink')}
        </Link>
      </div>
      <header className="sticky top-0 z-40 px-2 pt-2 sm:px-4">
        <div className="glass mx-auto flex h-14 max-w-[1400px] items-center gap-3 rounded-[18px] border border-border px-3 sm:h-16 sm:px-5">
          <Link
            to={authed ? `${base}/app` : base}
            className="min-w-0 rounded-sm"
            aria-label={t('nav.home', { firm: name })}
          >
            <ArenaMark name={name} />
          </Link>
          <nav aria-label={t('nav.label')} className="ml-4 hidden md:block">
            <ul className="flex items-center gap-1 text-sm font-medium">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    end={l.end}
                    className={({ isActive }) =>
                      cn(
                        'rounded-full px-3 py-1.5 transition-colors',
                        isActive && l.end ? 'bg-card-muted text-fg' : 'text-muted hover:text-fg',
                      )
                    }
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>
            <ThemeToggle />
            {authed ? (
              <PlayerChip />
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
        {/* Mobile: the same links as a scrollable pill row. */}
        <nav aria-label={t('nav.label')} className="mx-auto mt-2 max-w-[1400px] md:hidden">
          <ul className="flex gap-1 overflow-x-auto text-sm font-medium">
            {links.map((l) => (
              <li key={l.to} className="shrink-0">
                <NavLink
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    cn(
                      'glass block rounded-full border border-border px-3 py-1.5 whitespace-nowrap',
                      isActive && l.end ? 'text-fg' : 'text-muted',
                    )
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <footer className="mt-10 border-t border-border py-10 text-sm text-muted">
        <div className="mx-auto grid max-w-[1400px] gap-6 px-4 sm:px-6 md:grid-cols-[auto_1fr] md:gap-12">
          <div className="flex flex-col gap-3">
            <ArenaMark name={name} />
            <p>
              {t('footer.poweredBy')}{' '}
              <Link to={`/${lang}`} className="font-semibold text-link hover:underline">
                Daily Funded
              </Link>
            </p>
          </div>
          <div className="flex max-w-3xl flex-col gap-3">
            <p>{t('footer.disclaimer')}</p>
            <p>{t('footer.responsible')}</p>
          </div>
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
