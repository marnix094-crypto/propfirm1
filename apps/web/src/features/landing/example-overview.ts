import type { AccountOverviewData } from '@/components/dashboard/account-overview';
import { exampleSeries } from '@/lib/example-series';

/** Static EXAMPLE data for the landing preview. Always rendered with an "Example" badge. */
export const exampleOverview: AccountOverviewData = {
  accountLabel: 'Instant · $25,000',
  currency: 'USD',
  equityMinor: 2_612_840n,
  pnlMinor: 112_840n,
  pnlBps: 451,
  series: {
    '1W': exampleSeries('1W'),
    '1M': exampleSeries('1M'),
    '3M': exampleSeries('3M'),
    '6M': exampleSeries('6M'),
    '1Y': exampleSeries('1Y'),
  },
  dailyLoss: { usedMinor: 18_500n, limitMinor: 75_000n },
  drawdown: { usedMinor: 41_200n, limitMinor: 150_000n },
  health: 82,
  positions: [
    {
      id: '1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      size: '0.150',
      entryPrice: '67,012.4',
      pnlMinor: 48_210n,
    },
    {
      id: '2',
      symbol: 'ETHUSDT',
      side: 'SHORT',
      size: '2.40',
      entryPrice: '3,481.20',
      pnlMinor: -9_630n,
    },
    {
      id: '3',
      symbol: 'SOLUSDT',
      side: 'LONG',
      size: '35',
      entryPrice: '171.35',
      pnlMinor: 12_045n,
    },
  ],
};
