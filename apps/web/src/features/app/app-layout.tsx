import { useEffect } from 'react';
import { NavLink, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CandlestickChart, LayoutGrid, LayoutDashboard } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { SkipLink } from '@/components/layout/skip-link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useActiveAccount } from '@/hooks/use-trading';
import { useLiveAccount } from '@/hooks/use-realtime';
import { useThemeStore } from '@/stores/theme';
import { cn } from '@/lib/cn';
import { AccountSwitcher } from './account-switcher';
import { ConnectionBanner, LiveDot } from './connection-banner';
import { VerifyEmailBanner } from './verify-email-banner';

const NAV = [
  { to: 'portfolio', key: 'portfolio', icon: LayoutDashboard },
  { to: 'trade', key: 'trade', icon: CandlestickChart },
  { to: 'more', key: 'more', icon: LayoutGrid },
] as const;

/** Platform shell (black + lime palette): sidebar on desktop, bottom navigation on mobile. */
export function AppLayout() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { account } = useActiveAccount();
  const setSurface = useThemeStore((s) => s.setSurface);
  useLiveAccount(account?.id);

  // The platform has its own palette and theme (dark by default); restore the site's on exit.
  useEffect(() => {
    setSurface('platform');
    return () => setSurface('site');
  }, [setSurface]);

  return (
    <div className="min-h-dvh lg:pl-60">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card px-3 py-5 lg:flex">
        <NavLink to={`/${lang}/app`} className="rounded-sm px-3 py-1 text-fg" aria-label="Home">
          <Logo className="h-[18px]" />
        </NavLink>
        <nav aria-label={t('app.nav.main')} className="mt-8">
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {t('app.nav.platform')}
          </p>
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={`/${lang}/app/${to}`}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-card-muted text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
                        : 'text-muted hover:bg-card-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden="true" strokeWidth={1.75} />
                  {t(`app.nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-auto px-3 text-[11px] leading-relaxed text-muted">
          {t('common.simulatedNote')}
        </p>
      </aside>

      <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border px-4 sm:px-6">
        <NavLink to={`/${lang}/app`} className="rounded-sm text-fg lg:hidden" aria-label="Home">
          <Logo className="h-3.5" />
        </NavLink>
        <AccountSwitcher className="min-w-0" />
        <div className="ml-auto flex items-center gap-3">
          <LiveDot />
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
        </div>
      </header>
      <ConnectionBanner />
      <VerifyEmailBanner />

      <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label={t('app.nav.main')}
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-3">
          {NAV.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={`/${lang}/app/${to}`}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-fg' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn('size-5', isActive && 'text-accent')}
                      aria-hidden="true"
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                    {t(`app.nav.${key}`)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
