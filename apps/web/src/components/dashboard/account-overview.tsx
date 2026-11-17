import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { meterState } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Meter } from '@/components/ui/meter';
import { RadialMeter } from '@/components/ui/radial-meter';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Sparkline } from '@/components/motion/sparkline';
import { CountUp } from '@/components/motion/count-up';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';

export const EQUITY_RANGES = ['1W', '1M', '3M', '6M', '1Y'] as const;
export type EquityRange = (typeof EQUITY_RANGES)[number];

export interface OverviewPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  pnlMinor: bigint;
}

export interface AccountOverviewData {
  accountLabel: string;
  currency: string;
  equityMinor: bigint;
  pnlMinor: bigint;
  pnlBps: number;
  series: Record<EquityRange, number[]>;
  dailyLoss: { usedMinor: bigint; limitMinor: bigint };
  drawdown: { usedMinor: bigint; limitMinor: bigint };
  /** 0–100 */
  health: number;
  positions: OverviewPosition[];
}

interface AccountOverviewProps {
  data: AccountOverviewData;
  /** Extra badges in the header, e.g. "Example". */
  badges?: ReactNode;
  className?: string;
}

/**
 * Account overview: equity, curve, rule meters, health and open positions.
 * Used as the live preview on the landing page and as the dashboard core in phase 6.
 */
export function AccountOverview({ data, badges, className }: AccountOverviewProps) {
  const { t } = useTranslation();
  const f = useFormat();
  const [range, setRange] = useState<EquityRange>('1M');
  const money = useMemo(
    () => (v: number | bigint) => f.money(BigInt(v), data.currency),
    [f, data.currency],
  );
  const stateLabels = { safe: t('meter.safe'), warn: t('meter.warn'), breach: t('meter.breach') };
  const healthState = meterState(BigInt(100 - data.health), 100n);
  const positive = data.pnlMinor >= 0n;

  return (
    <Card variant="glass" padding="none" className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5 sm:px-6">
        <span className="text-sm font-semibold">{data.accountLabel}</span>
        <Badge variant="simulated">{t('common.simulated')}</Badge>
        {badges}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="p-5 sm:p-6">
          <Tabs
            label={t('overview.range')}
            value={range}
            onValueChange={(v) => setRange(v as EquityRange)}
            items={EQUITY_RANGES.map((r) => ({ value: r, label: t(`range.${r}`) }))}
            header={
              <div>
                <p className="text-sm text-muted">{t('overview.equity')}</p>
                <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  <CountUp value={data.equityMinor} format={money} />
                </p>
                <p
                  className={cn(
                    'mt-1 text-sm font-semibold tabular-nums',
                    positive ? 'text-profit' : 'text-loss',
                  )}
                >
                  {f.money(data.pnlMinor, data.currency, { signDisplay: 'exceptZero' })} ·{' '}
                  {positive ? '+' : ''}
                  {f.bps(data.pnlBps)}
                </p>
              </div>
            }
            listWrapperClassName="flex flex-wrap items-end justify-between gap-4"
          >
            {EQUITY_RANGES.map((r) => (
              <TabsContent key={r} value={r}>
                <Sparkline
                  data={data.series[r]}
                  className="mt-6 h-36 w-full sm:h-44"
                  label={t('overview.chartLabel')}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <div className="flex flex-col gap-5 border-t border-border p-5 sm:p-6 md:border-t-0 md:border-l">
          <div className="flex items-center gap-4">
            <RadialMeter
              value={data.health}
              state={healthState}
              label={t('overview.health')}
              valueText={`${data.health} / 100`}
              size={96}
            >
              <span className="text-xl font-bold tabular-nums">{data.health}</span>
            </RadialMeter>
            <div>
              <p className="text-sm font-semibold">{t('overview.health')}</p>
              <p className="text-xs text-muted">{t('overview.healthHint')}</p>
            </div>
          </div>
          <Meter
            label={t('overview.dailyLoss')}
            used={data.dailyLoss.usedMinor}
            limit={data.dailyLoss.limitMinor}
            usedLabel={money(data.dailyLoss.usedMinor)}
            limitLabel={money(data.dailyLoss.limitMinor)}
            stateLabels={stateLabels}
          />
          <Meter
            label={t('overview.maxDrawdown')}
            used={data.drawdown.usedMinor}
            limit={data.drawdown.limitMinor}
            usedLabel={money(data.drawdown.usedMinor)}
            limitLabel={money(data.drawdown.limitMinor)}
            stateLabels={stateLabels}
          />
        </div>
      </div>
      <div
        className="overflow-x-auto border-t border-border"
        role="region"
        aria-label={t('overview.positions')}
        tabIndex={0}
      >
        <table className="w-full min-w-[480px] text-sm">
          <caption className="sr-only">{t('overview.positions')}</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="px-5 py-3 font-medium sm:px-6">
                {t('overview.symbol')}
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                {t('overview.side')}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {t('overview.size')}
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                {t('overview.entry')}
              </th>
              <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">
                {t('overview.pnl')}
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.positions.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <th scope="row" className="px-5 py-3 text-left font-semibold sm:px-6">
                  {p.symbol}
                </th>
                <td className="px-3 py-3">
                  <Badge variant={p.side === 'LONG' ? 'success' : 'danger'}>
                    {t(`overview.${p.side}`)}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-right">{p.size}</td>
                <td className="px-3 py-3 text-right">{p.entryPrice}</td>
                <td
                  className={cn(
                    'px-5 py-3 text-right font-semibold sm:px-6',
                    p.pnlMinor >= 0n ? 'text-profit' : 'text-loss',
                  )}
                >
                  {f.money(p.pnlMinor, data.currency, { signDisplay: 'exceptZero' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
