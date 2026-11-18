import { useEffect } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Lock, Plus } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { SkipLink } from '@/components/layout/skip-link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useActiveAccount } from '@/hooks/use-trading';
import { useFunding } from '@/hooks/use-checkout';
import { useLiveAccount } from '@/hooks/use-realtime';
import { useThemeStore } from '@/stores/theme';
import { cn } from '@/lib/cn';
import { AccountSwitcher } from './account-switcher';
import { ConnectionBanner, LiveDot } from './connection-banner';
import { VerifyEmailBanner } from './verify-email-banner';
import { NAV_FOOTER, NAV_MOBILE, NAV_SECTIONS, type NavItem } from './nav';

function SideLink({ item, locked }: { item: NavItem; locked: boolean }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const Icon = item.icon;
  return (
    <NavLink
      to={`/${lang}/app/${item.to}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-[var(--btn-primary-fg)]'
            : item.soon
              ? 'text-muted hover:bg-card-muted hover:text-fg'
              : 'text-fg/85 hover:bg-card-muted hover:text-fg',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{t(`app.nav.${item.key}`)}</span>
      {item.soon && (
        <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
          {t('app.nav.soon')}
        </span>
      )}
      {item.isNew && (
        <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-bold tracking-wide text-[var(--btn-primary-fg)] uppercase">
          {t('app.nav.new')}
        </span>
      )}
      {item.lockable && locked && (
        <Lock className="size-3.5 shrink-0" aria-label={t('app.nav.locked')} />
      )}
    </NavLink>
  );
}

/** Platform shell (black + lime palette): sidebar on desktop, bottom navigation on mobile. */
export function AppLayout() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { account } = useActiveAccount();
  const setSurface = useThemeStore((s) => s.setSurface);
  useLiveAccount(account?.id);
  const funding = useFunding(account?.id, account?.kind === 'FUNDED');
  const payoutEligible = account?.kind === 'FUNDED' && !!funding.data?.payout?.eligible;

  // The platform has its own palette and theme (dark by default); restore the site's on exit.
  useEffect(() => {
    setSurface('platform');
    return () => setSurface('site');
  }, [setSurface]);

  return (
    <div className="min-h-dvh lg:pl-60">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <div className="px-6 pt-5 pb-4">
          <NavLink to={`/${lang}/app`} className="rounded-sm text-fg" aria-label="Home">
            <Logo className="h-[18px]" />
          </NavLink>
        </div>
        <div className="px-3">
          <Link
            to={`/${lang}/app/new-account`}
            className="btn-primary flex h-10 items-center justify-center gap-2 rounded-btn text-sm font-semibold"
          >
            <Plus className="size-4" aria-hidden="true" strokeWidth={2.25} />
            {t('app.nav.newAccount')}
          </Link>
        </div>
        <nav aria-label={t('app.nav.main')} className="mt-4 flex-1 overflow-y-auto px-3 pb-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="border-b border-border py-3 last:border-b-0">
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                {t(`app.nav.sections.${section.key}`)}
              </p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} locked={!payoutEligible} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-3">
          <ul className="flex flex-col gap-0.5">
            {NAV_FOOTER.map((item) => (
              <li key={item.to}>
                <SideLink item={item} locked={false} />
              </li>
            ))}
          </ul>
          <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted">
            {t('common.simulatedNote')}
          </p>
        </div>
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
        <ul className="grid grid-cols-4">
          {NAV_MOBILE.map(({ to, key, icon: Icon }) => (
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
