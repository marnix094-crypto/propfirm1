import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { EquityChart } from '@/components/charts/equity-chart';
import {
  useActiveAccount,
  useEquity,
  usePerformance,
  usePositions,
  useResetDemo,
  type EquityRange,
} from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/api-client';
import { MarketsList } from './markets-list';
import { amsterdamToday, PnlCalendar } from './pnl-calendar';
import { formatRatioBps, StatsPanel } from './stats-panel';
import { AccountClosedBanner, RulesCard } from '../rules/rules-card';
import { FundingCard } from '../funding/funding-card';

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];

/** 0–100: share of equity not used as margin. */
export function marginHealth(a: Pick<Account, 'equityMinor' | 'usedMarginMinor'>): number {
  const equity = BigInt(a.equityMinor);
  if (equity <= 0n) return 0;
  const used = BigInt(a.usedMarginMinor);
  const free = equity - used;
  return Math.max(0, Math.min(100, Number((free * 100n) / equity)));
}

function Kpi({
  label,
  value,
  sub,
  tone,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'profit' | 'loss';
  testId?: string;
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5">
      <p className="truncate text-xs text-muted">{label}</p>
      <p
        data-testid={testId}
        className={cn(
          'mt-1 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-xl',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted tabular-nums">{sub}</p>}
    </div>
  );
}

function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

const pnlTone = (v: bigint) => (v > 0n ? 'profit' : v < 0n ? 'loss' : undefined);

export function PortfolioPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const { account, isPending, isError, refetch } = useActiveAccount();
  const [range, setRange] = useState<EquityRange>('1M');
  const [confirmReset, setConfirmReset] = useState(false);
  const [month] = useState(() => amsterdamToday().slice(0, 7));
  const equity = useEquity(account?.id, range);
  const positions = usePositions(account?.id);
  const performance = usePerformance(account?.id, month);
  const reset = useResetDemo(account?.id);
  const money = useCallback(
    (m: bigint | string) => f.money(m, account?.currency ?? 'USD'),
    [f, account?.currency],
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('app.account.loading')}>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (isError || !account)
    return (
      <ErrorState title={t('app.account.error')} retryLabel={t('common.retry')} onRetry={refetch} />
    );

  const daily = BigInt(account.dailyPnlMinor);
  const dayStart = BigInt(account.equityMinor) - daily;
  const dailyBps = dayStart > 0n ? Number((daily * 10_000n) / dayStart) : 0;
  const unrealized = BigInt(account.unrealizedPnlMinor);
  const total = BigInt(account.equityMinor) - BigInt(account.initialBalanceMinor);
  const totalBps =
    BigInt(account.initialBalanceMinor) > 0n
      ? Number((total * 10_000n) / BigInt(account.initialBalanceMinor))
      : 0;
  const stats = performance.data?.stats;
  const signed = (m: bigint) => f.money(m, account.currency, { signDisplay: 'exceptZero' });
  const pct = (bps: number) => `${bps > 0 ? '+' : ''}${f.bps(bps)}`;

  return (
    <div className="flex flex-col gap-4">
      <title>{t('app.portfolio.title')}</title>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{account.label}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="simulated">{t(`app.account.kinds.${account.kind}`)}</Badge>
            {account.status === 'FAILED' && (
              <Badge variant="danger">{t('app.account.statuses.FAILED')}</Badge>
            )}
            {account.kind === 'DEMO' && <Badge>{t('app.account.virtual')}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {account.kind === 'DEMO' && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
              <RotateCcw aria-hidden="true" /> {t('app.portfolio.reset')}
            </Button>
          )}
          <Button size="sm" asChild>
            <Link to={`/${lang}/app/trade`}>
              {t('app.portfolio.trade')} <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <AccountClosedBanner account={account} />

      <section
        aria-label={t('dashboard.kpis')}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 xl:grid-cols-6"
      >
        <Kpi
          label={t('app.portfolio.value')}
          value={money(account.equityMinor)}
          sub={t('dashboard.sinceStart', { value: pct(totalBps) })}
          testId="account-value"
        />
        <Kpi label={t('app.portfolio.balance')} value={money(account.balanceMinor)} />
        <Kpi
          label={t('dashboard.today')}
          value={signed(daily)}
          sub={pct(dailyBps)}
          tone={pnlTone(daily)}
        />
        <Kpi
          label={t('app.portfolio.unrealized')}
          value={signed(unrealized)}
          tone={pnlTone(unrealized)}
          sub={t('dashboard.openPositions', { count: positions.data?.length ?? 0 })}
        />
        <Kpi
          label={t('dashboard.stats.winRate')}
          value={stats?.winRateBps == null ? '—' : f.bps(stats.winRateBps, 1)}
          sub={
            stats
              ? t('dashboard.stats.winsLosses', { wins: stats.wins, losses: stats.losses })
              : undefined
          }
        />
        <Kpi
          label={t('dashboard.stats.profitFactor')}
          value={formatRatioBps(stats?.profitFactorBps ?? null, f.locale)}
          sub={t('dashboard.marginFree', { value: `${marginHealth(account)}%` })}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card padding="none">
            <PanelHeader title={t('app.portfolio.equityCurve')}>
              <Tabs
                label={t('app.trade.timeframe')}
                value={range}
                onValueChange={(v) => setRange(v as EquityRange)}
                items={RANGES.map((r) => ({
                  value: r,
                  label: t(`range.${r}`, { defaultValue: r }),
                }))}
              />
            </PanelHeader>
            <div className="px-2 pt-3 pb-3">
              {equity.isPending ? (
                <Skeleton className="mx-3 h-64" />
              ) : equity.isError ? (
                <ErrorState
                  title={t('errors.generic')}
                  retryLabel={t('common.retry')}
                  onRetry={() => void equity.refetch()}
                />
              ) : (equity.data?.length ?? 0) < 2 ? (
                <EmptyState
                  title={t('app.portfolio.equityCurve')}
                  body={t('app.portfolio.noHistory')}
                />
              ) : (
                <EquityChart
                  points={equity.data!}
                  label={t('app.portfolio.equityCurve')}
                  formatValue={(v) => money(v)}
                  className="h-64 w-full sm:h-72"
                />
              )}
            </div>
          </Card>

          <PnlCalendar accountId={account.id} currency={account.currency} />

          <Card padding="none">
            <PanelHeader title={t('app.portfolio.positions')} />
            {positions.isPending ? (
              <Skeleton className="m-5 h-16" />
            ) : (positions.data?.length ?? 0) === 0 ? (
              <EmptyState
                title={t('app.portfolio.noPositions')}
                body={t('app.portfolio.noPositionsBody')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      {['symbol', 'side', 'size', 'entry', 'mark', 'pnl'].map((c) => (
                        <th
                          key={c}
                          scope="col"
                          className={cn(
                            'px-5 py-2.5 font-medium',
                            ['size', 'entry', 'mark', 'pnl'].includes(c) && 'text-right',
                          )}
                        >
                          {t(`dashboard.positions.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.data!.map((p) => {
                      const pnl = p.unrealizedPnlMinor ? BigInt(p.unrealizedPnlMinor) : null;
                      return (
                        <tr key={p.id} className="border-t border-border hover:bg-card-muted">
                          <td className="px-5 py-3 font-medium">
                            <Link to={`/${lang}/app/trade/${p.symbol}`} className="hover:underline">
                              {p.symbol}
                            </Link>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                p.side === 'LONG' ? 'text-profit' : 'text-loss',
                              )}
                            >
                              {t(`app.trade.${p.side}`)} {f.leverage(p.leverage)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">{p.qty}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{p.avgEntryPrice}</td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {p.markPrice ?? '—'}
                          </td>
                          <td
                            className={cn(
                              'px-5 py-3 text-right font-semibold tabular-nums',
                              pnl === null ? 'text-muted' : pnl >= 0n ? 'text-profit' : 'text-loss',
                            )}
                          >
                            {pnl === null ? '—' : signed(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <StatsPanel stats={stats} currency={account.currency} />
          <RulesCard account={account} />
          <FundingCard account={account} />
          <MarketsList />
        </div>
      </div>

      <Modal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('app.portfolio.resetTitle')}
        description={t('app.portfolio.resetBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => {
                  setConfirmReset(false);
                  toast({ kind: 'success', title: t('app.portfolio.resetDone') });
                },
                onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
              })
            }
          >
            {t('common.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
