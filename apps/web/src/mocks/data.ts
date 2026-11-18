import { quotePriceMinor } from '@brand/engine';
import type { Product, ProductRules } from '@/hooks/use-catalog';

/**
 * DEVELOPMENT / TEST DATA ONLY. Example sizes, prices and rules — not the real offer.
 * Mirrors the API's example catalogue. The UI shows a "mock data" indicator when MSW is active.
 */
export const exampleRules = (maxDrawdownBps: number): ProductRules => ({
  maxDailyLossBps: 300,
  maxDrawdownBps,
  drawdownType: 'TRAILING',
  profitSplitBps: 8_000,
  maxLeverage: 50,
  minTradingDays: 0,
  payoutIntervalDays: 14,
  minTradingDaysPerPayout: 3,
  scalingStepBps: 2_500,
  isExample: true,
});

const mk = (size: number, priceEur: number, recommended = false): Product => ({
  id: `instant-${size}`,
  slug: `instant-${size / 1000}k`,
  type: 'INSTANT',
  accountSizeMinor: String(size * 100),
  accountCurrency: 'USD',
  priceMinor: String(priceEur * 100),
  priceCurrency: 'EUR',
  isRecommended: recommended,
  isExample: true,
  rules: exampleRules(600),
});

export const exampleProducts: Product[] = [
  mk(5_000, 59),
  mk(10_000, 99),
  mk(25_000, 199, true),
  mk(50_000, 349),
  mk(100_000, 599),
];

/** Same example formula as the API (packages/engine). */
export const exampleQuotePriceMinor = quotePriceMinor;
