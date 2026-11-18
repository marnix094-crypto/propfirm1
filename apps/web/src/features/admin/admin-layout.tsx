import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight, KeyRound, Lock } from 'lucide-react';
import { FirmLogo, useFirmTheme } from '@/components/layout/firm-brand';
import { SkipLink } from '@/components/layout/skip-link';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useAdminMe, useFirms } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useFirmStore } from '@/stores/firm';
import { useSession } from '@/stores/session';
import { useThemeStore } from '@/stores/theme';
import { ADMIN_MOBILE, ADMIN_NAV } from './nav';

function useAdminTitle(): { title: string; section: string } {
  const { t } = useTranslation();
  const seg = useLocation().pathname.split('/')[3] ?? '';
  for (const s of ADMIN_NAV) {
    const item = s.items.find((i) => i.to === seg);
    if (item)
      return { title: t(`admin.nav.${item.key}`), section: t(`admin.nav.sections.${s.key}`) };
  }
  return {
    title: t(`admin.nav.${seg || 'overview'}`, { defaultValue: t('admin.nav.overview') }),
    section: t('admin.title'),
  };
}

/** Superadmins: which firm to administer (sent as X-Admin-Firm). */
function FirmSwitcher() {
  const { t } = useTranslation();
  const me = useAdminMe().data;
  const firms = useFirms(!!me?.superadmin);
  const { adminFirmId, setAdminFirm } = useFirmStore();
  if (!me?.superadmin) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm">
      <span className="sr-only">{t('admin.firmSwitcher')}</span>
      <select
        value={adminFirmId ?? me.firm.id}
        onChange={(e) => setAdminFirm(e.target.value)}
        className="h-10 max-w-52 truncate rounded-full border border-border bg-card px-4 text-sm font-semibold"
      >
        {(firms.data ?? [me.firm]).map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SideLinks({ superadmin, onNavigate }: { superadmin: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  return (
    <>
      {ADMIN_NAV.map((section) => (
        <div key={section.key} className="pb-4">
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            {t(`admin.nav.sections.${section.key}`)}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items
              .filter((i) => !i.superadminOnly || superadmin)
              .map(({ to, key, icon: Icon }) => (
                <li key={key}>
                  <NavLink
                    end={to === ''}
                    to={`/${lang}/admin${to ? `/${to}` : ''}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-[14px] border px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-border bg-card-muted text-fg'
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
                        {t(`admin.nav.${key}`)}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** Full-page notice when the user may not (yet) use the admin panel. */
function Gate({ kind }: { kind: 'forbidden' | '2fa' }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-16">
      <title>{t('admin.title')}</title>
      <Card className="flex flex-col items-start gap-4">
        <span className="inline-flex size-11 items-center justify-center rounded-[14px] bg-card-muted">
          {kind === '2fa' ? (
            <KeyRound className="size-5" aria-hidden="true" />
          ) : (
            <Lock className="size-5" aria-hidden="true" />
          )}
        </span>
        <h1 className="text-xl font-bold tracking-tight">{t(`admin.gate.${kind}.title`)}</h1>
        <p className="text-sm text-muted">{t(`admin.gate.${kind}.body`)}</p>
        <div className="flex flex-wrap gap-3">
          {kind === '2fa' && (
            <Button asChild>
              <Link to={`/${lang}/app/security`}>{t('admin.gate.2fa.cta')}</Link>
            </Button>
          )}
          <Button variant="secondary" asChild>
            <Link to={`/${lang}/app`}>{t('admin.backToPlatform')}</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}

/** Admin panel shell (light platform style): sidebar, top bar with firm, bottom nav on mobile. */
export function AdminLayout() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const setSurface = useThemeStore((s) => s.setSurface);
  const user = useSession((s) => s.user);
  const me = useAdminMe();
  const meta = useAdminTitle();
  useFirmTheme();

  useEffect(() => {
    setSurface('platform');
    return () => setSurface('site');
  }, [setSurface]);

  if (me.isPending)
    return (
      <div className="mx-auto max-w-5xl p-8" aria-busy="true">
        <Skeleton className="h-40 rounded-card" />
      </div>
    );
  if (me.isError) {
    const code = me.error instanceof ApiError ? me.error.code : null;
    if (code === 'ADMIN_FORBIDDEN') return <Gate kind="forbidden" />;
    return (
      <main id="main" className="mx-auto max-w-lg p-8">
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void me.refetch()}
        />
      </main>
    );
  }
  const data = me.data;
  if (data.twoFactorRequired && !data.twoFactorEnabled) return <Gate kind="2fa" />;

  return (
    <div className="min-h-dvh lg:pl-64">
      <SkipLink />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-[72px] items-center gap-2 border-b border-border px-5">
          <FirmLogo className="h-4" />
          <span className="rounded-full bg-[var(--brand-ink)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--brand-on-ink)] uppercase">
            {t('admin.badge')}
          </span>
        </div>
        <nav aria-label={t('admin.nav.main')} className="flex-1 overflow-y-auto px-3 py-4">
          <SideLinks superadmin={data.superadmin} />
        </nav>
        <div className="border-t border-border p-4">
          <Link
            to={`/${lang}/app`}
            className="mb-3 flex items-center gap-2 text-sm font-semibold text-link hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> {t('admin.backToPlatform')}
          </Link>
          <LanguageSwitcher />
        </div>
      </aside>

      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          <span className="lg:hidden">
            <FirmLogo compact className="size-8" />
          </span>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-lg font-bold tracking-tight">{meta.title}</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              {meta.section}
              <ChevronRight className="size-3" aria-hidden="true" />
              {meta.title}
            </p>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <FirmSwitcher />
            {!data.superadmin && (
              <span className="hidden truncate text-sm font-semibold sm:inline">
                {data.firm.name}
              </span>
            )}
            <div className="hidden text-right xl:block">
              <p className="max-w-48 truncate text-sm font-semibold">{user?.email}</p>
              <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
                {data.superadmin ? t('admin.role.SUPERADMIN') : t(`admin.role.${data.role}`)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[1480px] px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-10"
      >
        {data.firm.status === 'SUSPENDED' && (
          <p
            role="status"
            className="mb-4 rounded-[14px] border border-loss/40 bg-card px-4 py-3 text-sm font-medium text-loss"
          >
            {t('admin.firmSuspended')}
          </p>
        )}
        <Outlet />
      </main>

      <nav
        aria-label={t('admin.nav.main')}
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {ADMIN_MOBILE.map(({ to, key, icon: Icon }) => (
            <li key={key}>
              <NavLink
                end={to === ''}
                to={`/${lang}/admin${to ? `/${to}` : ''}`}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                    isActive ? 'text-fg' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'inline-flex h-7 w-12 items-center justify-center rounded-full',
                        isActive && 'bg-primary-tint',
                      )}
                    >
                      <Icon
                        className={cn('size-5', isActive && 'text-accent')}
                        aria-hidden="true"
                      />
                    </span>
                    {t(`admin.nav.${key}`)}
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

/** Mobile: every admin section in one list (the bottom bar only fits four). */
export function AdminMenuPage() {
  const { t } = useTranslation();
  const superadmin = !!useAdminMe().data?.superadmin;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold tracking-tight">{t('admin.nav.menu')}</h1>
      <Card padding="none" className="p-3">
        <nav aria-label={t('admin.nav.menu')}>
          <SideLinks superadmin={superadmin} />
        </nav>
      </Card>
      <LanguageSwitcher />
    </div>
  );
}
