import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import type { Schemas } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type Stats = Schemas['TradeStatsDto'];

/** Profit factor (bps) as a plain ratio, e.g. 23_400 → "2.34". */
export function formatRatioBps(bps: number | null, locale: string): string {
  if (bps === null) return '—';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bps / 10_000);
}

/** All-time trade statistics: win rate, profit factor, averages and extremes. */
export function StatsPanel({ stats, currency }: { stats: Stats | undefined; currency: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const money = (m: string | null) =>
    m === null ? '—' : f.money(m, currency, { signDisplay: 'exceptZero' });
  const tone = (m: string | null) =>
    m === null || m === '0' ? undefined : BigInt(m) > 0n ? 'text-profit' : 'text-loss';

  return (
    <Card padding="none" data-testid="stats-panel">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">{t('dashboard.stats.title')}</h2>
      </div>
      {!stats ? (
        <Skeleton className="m-5 h-64" />
      ) : (
        <div className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted">{t('dashboard.stats.winRate')}</p>
              <p
                className="text-3xl font-semibold tracking-tight tabular-nums"
                data-testid="win-rate"
              >
                {stats.winRateBps === null ? '—' : f.bps(stats.winRateBps, 1)}
              </p>
            </div>
            <p className="pb-1 text-sm text-muted tabular-nums">
              {t('dashboard.stats.winsLosses', { wins: stats.wins, losses: stats.losses })}
            </p>
          </div>
          <div
            className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]"
            aria-hidden="true"
          >
            {stats.wins + stats.losses > 0 && (
              <>
                <span className="bg-[var(--profit)]" style={{ flexGrow: stats.wins }} />
                <span className="bg-[var(--loss)]" style={{ flexGrow: stats.losses }} />
              </>
            )}
          </div>

          <dl className="mt-5 divide-y divide-border text-sm">
            {(
              [
                ['trades', String(stats.trades)],
                ['profitFactor', formatRatioBps(stats.profitFactorBps, f.locale)],
                ['netPnl', money(stats.netPnlMinor), tone(stats.netPnlMinor)],
                ['avgWin', money(stats.avgWinMinor), tone(stats.avgWinMinor)],
                ['avgLoss', money(stats.avgLossMinor), tone(stats.avgLossMinor)],
                ['expectancy', money(stats.expectancyMinor), tone(stats.expectancyMinor)],
                ['bestTrade', money(stats.bestTradeMinor), tone(stats.bestTradeMinor)],
                ['worstTrade', money(stats.worstTradeMinor), tone(stats.worstTradeMinor)],
              ] as [string, string, string?][]
            ).map(([k, v, cls]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-muted">{t(`dashboard.stats.${k}`)}</dt>
                <dd className={cn('font-medium tabular-nums', cls)}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}
