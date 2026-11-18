import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { useActiveAccount, usePerformance } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import type { Schemas } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { amsterdamToday, PnlCalendar } from '../portfolio/pnl-calendar';
import { formatRatioBps, StatsPanel } from '../portfolio/stats-panel';

type Group = Schemas['GroupStatsDto'];

function GroupTable({
  rows,
  label,
  currency,
  keyLabel,
}: {
  rows: Group[];
  label: (key: string) => string;
  currency: string;
  keyLabel: string;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  if (rows.length === 0)
    return <p className="px-5 py-8 text-center text-sm text-muted">{t('stats.noTrades')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="px-5 py-2.5 font-medium">
              {keyLabel}
            </th>
            {['trades', 'winRate', 'profitFactor', 'netPnl'].map((c) => (
              <th key={c} scope="col" className="px-5 py-2.5 text-right font-medium">
                {t(`dashboard.stats.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const net = BigInt(r.netPnlMinor);
            return (
              <tr key={r.key} className="border-t border-border">
                <th scope="row" className="px-5 py-3 text-left font-medium">
                  {label(r.key)}
                </th>
                <td className="px-5 py-3 text-right tabular-nums">{r.trades}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {r.winRateBps === null ? '—' : f.bps(r.winRateBps, 1)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatRatioBps(r.profitFactorBps, f.locale)}
                </td>
                <td
                  className={cn(
                    'px-5 py-3 text-right font-semibold tabular-nums',
                    net > 0n ? 'text-profit' : net < 0n ? 'text-loss' : undefined,
                  )}
                >
                  {f.money(net, currency, { signDisplay: 'exceptZero' })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "My Stats": all-time statistics, breakdowns per symbol and direction, and the PnL calendar. */
export function StatsPage() {
  const { t } = useTranslation();
  const { account, isPending, isError, refetch } = useActiveAccount();
  const [month] = useState(() => amsterdamToday().slice(0, 7));
  const perf = usePerformance(account?.id, month);

  if (isPending) return <Skeleton className="h-96" />;
  if (isError || !account)
    return (
      <ErrorState title={t('app.account.error')} retryLabel={t('common.retry')} onRetry={refetch} />
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('app.nav.stats')}
        subtitle={t('stats.subtitle', { account: account.label })}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PnlCalendar accountId={account.id} currency={account.currency} />
          <Panel title={t('stats.bySymbol')} data-testid="stats-by-symbol">
            {perf.data ? (
              <GroupTable
                rows={perf.data.bySymbol}
                currency={account.currency}
                keyLabel={t('dashboard.positions.symbol')}
                label={(k) => k}
              />
            ) : (
              <Skeleton className="m-5 h-24" />
            )}
          </Panel>
          <Panel title={t('stats.byDirection')}>
            {perf.data ? (
              <GroupTable
                rows={perf.data.byDirection}
                currency={account.currency}
                keyLabel={t('dashboard.positions.side')}
                label={(k) => t(`app.trade.${k}`)}
              />
            ) : (
              <Skeleton className="m-5 h-24" />
            )}
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <StatsPanel stats={perf.data?.stats} currency={account.currency} />
        </div>
      </div>
    </div>
  );
}
