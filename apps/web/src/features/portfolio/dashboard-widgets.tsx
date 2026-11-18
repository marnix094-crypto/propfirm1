import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, CalendarDays, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { call, client, type Account } from '@/lib/api-client';
import { qk, useAccounts } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { useTradingUi } from '@/stores/trading';
import { cn } from '@/lib/cn';
import { amsterdamToday, shiftMonth } from './pnl-calendar';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Current time, refreshed every `ms` (render stays pure). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export const pctOf = (value: bigint, total: bigint): number => {
  if (total <= 0n) return 0;
  const p = Number((value * 1000n) / total) / 10;
  return Math.max(0, Math.min(100, p));
};

/** Rounded icon tile used in card headers. */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card-muted text-accent',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Thin progress bar (animated with transform). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="h-2 overflow-hidden rounded-full bg-[var(--meter-track)]"
    >
      <motion.div
        className="h-full origin-left rounded-full bg-primary"
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: value / 100 }}
        transition={{ duration: 0.9, ease: EASE }}
      />
    </div>
  );
}

/** "Barcode" progress bar from the design: many thin segments, filled up to the value. */
export function SegmentBar({
  value,
  label,
  tone = 'lime',
}: {
  value: number;
  label: string;
  tone?: 'lime' | 'warn';
}) {
  const reduce = useReducedMotion();
  const n = 48;
  const filled = Math.round((value / 100) * n);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="flex h-6 items-stretch gap-[3px]"
    >
      {Array.from({ length: n }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className={cn(
            'w-full origin-bottom rounded-[2px]',
            i < filled
              ? tone === 'lime'
                ? 'bg-[var(--meter-safe)]'
                : 'bg-[var(--meter-warn)]'
              : 'bg-[var(--meter-track)]',
          )}
          initial={reduce ? false : { scaleY: 0.3, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: EASE, delay: i * 0.012 }}
        />
      ))}
    </div>
  );
}

export function StatCard({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card padding="none" className={cn('flex flex-col p-5 sm:p-6', className)}>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-3 flex-1">{children}</div>
    </Card>
  );
}

/** Change pill, e.g. "+12.5%" (green) or "-3.1%" (red). */
export function ChangePill({ bps }: { bps: number }) {
  const f = useFormat();
  const up = bps >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        up
          ? 'bg-[color-mix(in_srgb,var(--profit)_14%,transparent)] text-[var(--badge-success-fg)]'
          : 'bg-[color-mix(in_srgb,var(--loss)_12%,transparent)] text-[var(--badge-danger-fg)]',
      )}
    >
      {up ? (
        <ArrowUp className="size-3" aria-hidden="true" />
      ) : (
        <ArrowDown className="size-3" aria-hidden="true" />
      )}
      {f.bps(Math.abs(bps), 1)}
    </span>
  );
}

/** Profile card: avatar, member since, win rate and the last four months' results. */
export function ProfileCard({
  name,
  memberSince,
  winRateBps,
  account,
}: {
  name: string;
  memberSince: string | null;
  winRateBps: number | null;
  account: Account;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const reduce = useReducedMotion();
  const [thisMonth] = useState(() => amsterdamToday().slice(0, 7));
  const months = useMemo(() => [3, 2, 1, 0].map((d) => shiftMonth(thisMonth, -d)), [thisMonth]);
  const perf = useQueries({
    queries: months.map((m) => ({
      queryKey: qk.performance(account.id, m),
      queryFn: () =>
        call(() =>
          client.GET('/api/v1/accounts/{id}/performance', {
            params: { path: { id: account.id }, query: { month: m } },
          }),
        ),
    })),
  });
  const nets = perf.map((q) => (q.data ? BigInt(q.data.calendar.netMinor) : 0n));
  const maxAbs = nets.reduce((m, v) => ((v < 0n ? -v : v) > m ? (v < 0n ? -v : v) : m), 0n);
  const best = nets.reduce((bi, v, i) => (v > nets[bi]! ? i : bi), 0);
  const initial = BigInt(account.initialBalanceMinor);
  const label = (m: string) => {
    const [y, mo] = m.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat(f.locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, mo - 1, 1)),
    );
  };

  return (
    <Card
      padding="none"
      className="relative overflow-hidden p-5 [background:var(--card-highlight)] sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-12 items-center justify-center rounded-full bg-[var(--brand-ink)] font-display text-sm font-semibold text-[var(--brand-lime)]"
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold tracking-tight">{name}</p>
          {memberSince && (
            <p className="text-xs text-muted">
              {t('dashboard.memberSince', { date: memberSince })}
            </p>
          )}
        </div>
      </div>
      <p className="mt-6 text-sm text-muted">{t('dashboard.stats.winRate')}</p>
      <p
        className="font-display text-4xl font-semibold tracking-tight tabular-nums"
        data-testid="win-rate"
      >
        {winRateBps === null ? '—' : f.bps(winRateBps, 2)}
      </p>
      <div
        className="mt-6 grid h-36 grid-cols-4 items-end gap-3"
        aria-label={t('dashboard.monthly')}
        role="img"
      >
        {months.map((m, i) => {
          const v = nets[i]!;
          const abs = v < 0n ? -v : v;
          const h = maxAbs > 0n ? 18 + Number((abs * 82n) / maxAbs) : 18;
          const isBest = i === best && v > 0n;
          const retBps = initial > 0n ? Number((v * 10_000n) / initial) : 0;
          return (
            <div key={m} className="flex h-full flex-col items-center justify-end gap-2">
              {isBest && (
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-[var(--badge-success-fg)] tabular-nums">
                  ↑ {f.bps(retBps, 2)}
                </span>
              )}
              <motion.span
                className={cn(
                  'w-full origin-bottom rounded-[12px] border border-border',
                  isBest
                    ? 'bg-[repeating-linear-gradient(135deg,var(--primary)_0_6px,var(--primary-tint)_6px_12px)]'
                    : v < 0n
                      ? 'bg-[color-mix(in_srgb,var(--loss)_14%,var(--card))]'
                      : 'bg-card-muted',
                )}
                style={{ height: `${h}%` }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.08 }}
              />
              <span className="text-[11px] text-muted capitalize">{label(m)}</span>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        {months.map((m, i) => `${label(m)}: ${f.money(nets[i]!, account.currency)}`).join(', ')}
      </p>
    </Card>
  );
}

/** "Active accounts" cards (size, id, status, period, P&L, win rate, progress bar). */
export function ActiveAccounts({ current }: { current: Account }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const accounts = useAccounts();
  const setActive = useTradingUi((s) => s.setActiveAccount);
  const [month] = useState(() => amsterdamToday().slice(0, 7));
  const list = (accounts.data ?? []).filter((a) => a.status !== 'FAILED' && a.status !== 'CLOSED');
  const perf = useQueries({
    queries: list.map((a) => ({
      queryKey: qk.performance(a.id, month),
      queryFn: () =>
        call(() =>
          client.GET('/api/v1/accounts/{id}/performance', {
            params: { path: { id: a.id }, query: { month } },
          }),
        ),
    })),
  });
  const funding = useQueries({
    queries: list.map((a) => ({
      queryKey: qk.funding(a.id),
      queryFn: () =>
        call(() => client.GET('/api/v1/accounts/{id}/funding', { params: { path: { id: a.id } } })),
      enabled: a.kind === 'FUNDED',
    })),
  });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <Card padding="none" className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 px-1 pb-4">
        <h2 className="text-[15px] font-semibold">{t('dashboard.activeAccounts')}</h2>
        <Link
          to={`/${lang}/app/track-record`}
          className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          {t('dashboard.viewAll')} <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {accounts.isPending ? (
        <Skeleton className="h-48 rounded-card" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a, i) => {
            const pnl = BigInt(a.equityMinor) - BigInt(a.initialBalanceMinor);
            const stats = perf[i]?.data?.stats;
            const scaling = funding[i]?.data?.scaling;
            const progress =
              a.kind === 'FUNDED' && scaling
                ? pctOf(BigInt(scaling.profitMinor), BigInt(scaling.targetMinor))
                : pctOf(BigInt(a.usedMarginMinor), BigInt(a.equityMinor));
            const progressLabel =
              a.kind === 'FUNDED' ? t('dashboard.scalingTarget') : t('dashboard.marginUsed');
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setActive(a.id);
                  void navigate(`/${lang}/app/portfolio`);
                }}
                aria-current={a.id === current.id ? 'true' : undefined}
                className={cn(
                  'rounded-[18px] border bg-card-muted/60 p-5 text-left transition-colors hover:border-border-strong',
                  a.id === current.id ? 'border-border-strong' : 'border-border',
                )}
              >
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-display text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                    {f.moneyWhole(a.initialBalanceMinor, a.currency)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                      ID #{a.id.slice(-6).toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        a.kind === 'FUNDED'
                          ? 'bg-primary text-[var(--btn-primary-fg)]'
                          : 'border border-border bg-card text-fg',
                      )}
                    >
                      {t(`app.account.kinds.${a.kind}`)}
                    </span>
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {a.label} · {t('dashboard.since', { date: date(a.createdAt) })}
                </span>
                <span className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <span>
                    <span className="block text-xs text-muted">{t('dashboard.profitLoss')}</span>
                    <span
                      className={cn(
                        'mt-0.5 block font-display font-semibold tabular-nums',
                        pnl > 0n ? 'text-profit' : pnl < 0n ? 'text-loss' : undefined,
                      )}
                    >
                      {f.money(pnl, a.currency, { signDisplay: 'exceptZero' })}
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted">{t('dashboard.stats.winRate')}</span>
                    <span className="mt-0.5 block font-display font-semibold tabular-nums">
                      {stats?.winRateBps == null ? '—' : f.bps(stats.winRateBps, 0)}
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted">{t('dashboard.stats.trades')}</span>
                    <span className="mt-0.5 block font-display font-semibold tabular-nums">
                      {stats?.trades ?? '—'}
                    </span>
                  </span>
                </span>
                <span className="mt-5 flex items-center justify-between text-xs">
                  <span className="text-muted">{progressLabel}</span>
                  <span className="font-semibold tabular-nums">{progress.toFixed(1)}%</span>
                </span>
                <span className="mt-2 block">
                  <SegmentBar
                    value={progress}
                    label={progressLabel}
                    tone={a.kind === 'FUNDED' ? 'lime' : 'warn'}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
