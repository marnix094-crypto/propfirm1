import { NavLink, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CandlestickChart, LayoutGrid, WalletCards } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { SkipLink } from '@/components/layout/skip-link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { useActiveAccount } from '@/hooks/use-trading';
import { useLiveAccount } from '@/hooks/use-realtime';
import { cn } from '@/lib/cn';
import { AccountSwitcher } from './account-switcher';
import { ConnectionBanner, LiveDot } from './connection-banner';

const NAV = [
  { to: 'portfolio', key: 'portfolio', icon: WalletCards },
  { to: 'trade', key: 'trade', icon: CandlestickChart },
  { to: 'more', key: 'more', icon: LayoutGrid },
] as const;

/** Platform shell: sidebar on desktop, bottom navigation on mobile. */
export function AppLayout() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { account } = useActiveAccount();
  useLiveAccount(account?.id);

  return (
    <div className="min-h-dvh lg:pl-64">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card/80 px-4 py-5 backdrop-blur lg:flex">
        <NavLink to={`/${lang}/app`} className="rounded-sm px-2" aria-label="Home">
          <Logo />
        </NavLink>
        <nav aria-label={t('app.nav.main')} className="mt-8">
          <ul className="flex flex-col gap-1">
            {NAV.map(({ to, key, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={`/${lang}/app/${to}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[15px] font-semibold transition-colors',
                      isActive
                        ? 'bg-primary-tint/50 text-fg'
                        : 'text-muted hover:bg-primary-tint/25 hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
                  {t(`app.nav.${key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto">
          <Badge variant="simulated">{t('common.simulated')}</Badge>
        </div>
      </aside>

      <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 px-4 sm:px-6">
        <NavLink to={`/${lang}/app`} className="rounded-sm lg:hidden" aria-label="Home">
          <Logo className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
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

      <main id="main" className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label={t('app.nav.main')}
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border/70 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-3">
          {NAV.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={`/${lang}/app/${to}`}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2.5 text-xs font-semibold transition-colors',
                    isActive ? 'text-fg' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-6" aria-hidden="true" strokeWidth={isActive ? 2 : 1.6} />
                    {t(`app.nav.${key}`)}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1 rounded-full',
                        isActive ? 'bg-primary' : 'bg-transparent',
                      )}
                    />
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
