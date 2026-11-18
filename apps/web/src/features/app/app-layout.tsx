import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Lock, PanelLeft, Plus } from 'lucide-react';
import { Logo, LogoMark } from '@/components/layout/logo';
import { SkipLink } from '@/components/layout/skip-link';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useActiveAccount } from '@/hooks/use-trading';
import { useFunding } from '@/hooks/use-checkout';
import { useTraderProfile } from '@/hooks/use-features';
import { useLiveAccount } from '@/hooks/use-realtime';
import { useSession } from '@/stores/session';
import { useThemeStore } from '@/stores/theme';
import { cn } from '@/lib/cn';
import { AccountSwitcher } from './account-switcher';
import { ConnectionBanner, LiveDot } from './connection-banner';
import { VerifyEmailBanner } from './verify-email-banner';
import { NAV_FOOTER, NAV_MOBILE, NAV_SECTIONS, type NavItem } from './nav';

const COLLAPSE_KEY = 'df-sidebar-collapsed';

/** Title + breadcrumb for the top bar, derived from the route. */
function usePageMeta(): { title: string; section: string } {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const seg = pathname.split('/')[3] ?? 'portfolio';
  for (const s of NAV_SECTIONS) {
    const item = s.items.find((i) => i.to === seg);
    if (item)
      return {
        title: seg === 'portfolio' ? t('app.top.overview') : t(`app.nav.${item.key}`),
        section: t(`app.nav.sections.${s.key}`),
      };
  }
  const footer = NAV_FOOTER.find((i) => i.to === seg);
  const extra: Record<string, string> = {
    'new-account': t('app.nav.newAccount'),
    checkout: t('checkout.title'),
    security: t('app.more.security'),
  };
  return {
    title: footer ? t(`app.nav.${footer.key}`) : (extra[seg] ?? t('app.top.overview')),
    section: t('app.nav.sections.main'),
  };
}

function SideLink({
  item,
  locked,
  collapsed,
}: {
  item: NavItem;
  locked: boolean;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const Icon = item.icon;
  const label = t(`app.nav.${item.key}`);
  return (
    <NavLink
      to={`/${lang}/app/${item.to}`}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'border-border bg-card-muted text-fg shadow-[0_1px_2px_rgb(10_10_10/0.04)]'
            : 'border-transparent text-muted hover:bg-card-muted hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn('size-[18px] shrink-0', isActive && 'text-accent')}
            aria-hidden="true"
            strokeWidth={1.75}
          />
          <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{label}</span>
          {!collapsed && item.isNew && (
            <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-bold tracking-wide text-[var(--btn-primary-fg)] uppercase">
              {t('app.nav.new')}
            </span>
          )}
          {!collapsed && item.lockable && locked && (
            <Lock className="size-3.5 shrink-0" aria-label={t('app.nav.locked')} />
          )}
        </>
      )}
    </NavLink>
  );
}

function UserChip() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const profile = useTraderProfile();
  const { account } = useActiveAccount();
  const name = profile.data?.nickname ?? user?.email.split('@')[0] ?? '';
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right xl:block">
        <p className="max-w-40 truncate text-sm font-semibold">{name}</p>
        <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
          {account ? t(`app.top.role.${account.kind}`) : ''}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-[var(--brand-ink)] text-sm font-bold text-[var(--brand-lime)]"
      >
        {initials}
      </span>
    </div>
  );
}

/** Platform shell (light, Daily Funded lime): sidebar + top bar on desktop, bottom nav on mobile. */
export function AppLayout() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { account } = useActiveAccount();
  const setSurface = useThemeStore((s) => s.setSurface);
  const meta = usePageMeta();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useLiveAccount(account?.id);
  const funding = useFunding(account?.id, account?.kind === 'FUNDED');
  const payoutEligible = account?.kind === 'FUNDED' && !!funding.data?.payout?.eligible;

  // The platform has its own palette (light only); restore the site's on exit.
  useEffect(() => {
    setSurface('platform');
    return () => setSurface('site');
  }, [setSurface]);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  return (
    <div className={cn('min-h-dvh', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
      <SkipLink />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-card transition-[width] duration-300 lg:flex',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-[72px] items-center border-b border-border',
            collapsed ? 'justify-center px-2' : 'justify-between px-5',
          )}
        >
          {!collapsed && (
            <NavLink to={`/${lang}/app`} className="rounded-sm text-fg" aria-label="Home">
              <Logo className="h-4" />
            </NavLink>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t(collapsed ? 'app.top.expand' : 'app.top.collapse')}
            aria-pressed={collapsed}
            className="inline-flex size-9 items-center justify-center rounded-[10px] text-muted hover:bg-card-muted hover:text-fg"
          >
            <PanelLeft className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={t('app.nav.main')} className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="pb-4">
              {!collapsed && (
                <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {t(`app.nav.sections.${section.key}`)}
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <SideLink item={item} locked={!payoutEligible} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="border-t border-border pt-4">
            <ul className="flex flex-col gap-1">
              {NAV_FOOTER.map((item) => (
                <li key={item.to}>
                  <SideLink item={item} locked={false} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        </nav>
        {!collapsed && (
          <div className="border-t border-border p-4">
            <LanguageSwitcher />
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              {t('common.simulatedNote')}
            </p>
          </div>
        )}
      </aside>

      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <NavLink to={`/${lang}/app`} className="shrink-0 rounded-sm lg:hidden" aria-label="Home">
            <LogoMark className="size-8" />
          </NavLink>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate font-display text-lg font-semibold tracking-tight">
              {meta.title}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted">
              {meta.section}
              <ChevronRight className="size-3" aria-hidden="true" />
              {meta.title}
            </p>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <LiveDot />
            <AccountSwitcher className="min-w-0" />
            <Link
              to={`/${lang}/app/new-account`}
              className="btn-primary hidden h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-1.5 text-sm font-semibold md:inline-flex"
            >
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--brand-ink)] text-[var(--brand-lime)]">
                <Plus className="size-4" aria-hidden="true" strokeWidth={2.5} />
              </span>
              {t('app.nav.newAccount')}
            </Link>
            <UserChip />
          </div>
        </div>
      </header>
      <ConnectionBanner />
      <VerifyEmailBanner />

      <main
        id="main"
        className="mx-auto w-full max-w-[1480px] px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-10"
      >
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
                    <span
                      className={cn(
                        'inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-primary-tint',
                      )}
                    >
                      <Icon
                        className={cn('size-5', isActive && 'text-accent')}
                        aria-hidden="true"
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                    </span>
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
