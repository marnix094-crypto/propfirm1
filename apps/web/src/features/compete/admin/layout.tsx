import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ClipboardList,
  Gauge,
  KeyRound,
  LogOut,
  Settings,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkipLink } from '@/components/layout/skip-link';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { cn } from '@/lib/cn';
import { useCompeteAdmin, useOperators } from './api';

export const ADMIN_NAV = [
  { to: '', key: 'overview', icon: Gauge },
  { to: 'rounds', key: 'rounds', icon: Trophy },
  { to: 'players', key: 'players', icon: Users },
  { to: 'payouts', key: 'payouts', icon: Wallet },
  { to: 'settings', key: 'settings', icon: Settings },
  { to: 'audit', key: 'audit', icon: ClipboardList },
  { to: 'security', key: 'security', icon: KeyRound },
] as const;

function OperatorPicker() {
  const { t } = useTranslation('competeAdmin');
  const staff = useCompeteAdmin((s) => s.staff);
  const operator = useCompeteAdmin((s) => s.operator);
  const setOperator = useCompeteAdmin((s) => s.setOperator);
  const ops = useOperators(staff?.role === 'SUPERADMIN' && !staff.twoFactorRequired);
  useEffect(() => {
    if (!operator && ops.data?.[0]) setOperator(ops.data[0].slug);
  }, [operator, ops.data, setOperator]);
  if (staff?.role !== 'SUPERADMIN')
    return <p className="truncate text-sm font-semibold">{staff?.operatorName}</p>;
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted">{t('layout.operator')}</span>
      <select
        value={operator ?? ''}
        onChange={(e) => setOperator(e.target.value)}
        className="mt-1 h-10 w-full truncate rounded-[12px] border border-border bg-card px-3 text-sm font-semibold"
      >
        {(ops.data ?? []).map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Restores the admin session once (refresh cookie). */
function useBoot() {
  const status = useCompeteAdmin((s) => s.status);
  useEffect(() => {
    if (status === 'unknown') void useCompeteAdmin.getState().refresh();
  }, [status]);
  return status;
}

/** Protects the panel; staff without the required 2FA are sent to the security page. */
export function RequireCompeteAdmin({ children }: { children: ReactNode }) {
  const status = useBoot();
  const staff = useCompeteAdmin((s) => s.staff);
  const { lang } = useParams();
  const loc = useLocation();
  if (status === 'unknown') return <div className="min-h-dvh" aria-busy="true" />;
  if (status === 'anonymous' || !staff)
    return <Navigate to={`/${lang}/compete/admin/login`} replace />;
  if (staff.twoFactorRequired && !loc.pathname.endsWith('/security'))
    return <Navigate to={`/${lang}/compete/admin/security`} replace />;
  return <>{children}</>;
}

/** Compete admin panel shell — separate from the prop-firm admin panel and from player pages. */
export function CompeteAdminLayout() {
  const { t } = useTranslation('competeAdmin');
  const { lang } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const staff = useCompeteAdmin((s) => s.staff);
  const base = `/${lang}/compete/admin`;
  const items = [
    ...ADMIN_NAV,
    ...(staff?.role === 'SUPERADMIN'
      ? [{ to: 'operators', key: 'operators', icon: Building2 } as const]
      : []),
  ];

  const logout = async () => {
    await useCompeteAdmin.getState().logout();
    qc.removeQueries({ queryKey: ['compete-admin'] });
    navigate(`${base}/login`, { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <SkipLink />
      <aside className="border-b border-border bg-card-muted/60 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-5 p-4 lg:p-5">
          <div className="flex items-center justify-between gap-3">
            <Link to={base} className="font-display text-lg font-bold tracking-tight">
              {t('layout.title')}
            </Link>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted">
              {t(`roles.${staff?.role ?? 'OWNER'}`)}
            </span>
          </div>
          <OperatorPicker />
          <nav aria-label={t('layout.nav')} className="-mx-1 overflow-x-auto lg:overflow-visible">
            <ul className="flex gap-1 px-1 lg:flex-col">
              {items.map((i) => (
                <li key={i.key}>
                  <NavLink
                    to={i.to ? `${base}/${i.to}` : base}
                    end={!i.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                        isActive
                          ? 'bg-primary text-[var(--btn-primary-fg)]'
                          : 'text-muted hover:bg-card hover:text-fg',
                      )
                    }
                  >
                    <i.icon className="size-4" aria-hidden="true" />
                    {t(`nav.${i.key}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto hidden flex-col gap-3 lg:flex">
            <LanguageSwitcher />
            <p className="truncate text-xs text-muted">{staff?.email}</p>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut aria-hidden="true" />
              {t('layout.logout')}
            </Button>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <Outlet />
          <div className="flex justify-end lg:hidden">
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut aria-hidden="true" />
              {t('layout.logout')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
