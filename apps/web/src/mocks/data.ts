import type { ProductDto, ProductRulesDto } from '@brand/shared';

/**
 * DEVELOPMENT / TEST DATA ONLY. Example sizes, prices and rules — not the real offer.
 * The UI shows a "mock data" indicator whenever MSW is active.
 */
const rules = (maxDrawdownBps: number): ProductRulesDto => ({
  maxDailyLossBps: 300,
  maxDrawdownBps,
  drawdownType: 'TRAILING',
  profitSplitBps: 8_000,
  maxLeverage: 50,
  minTradingDays: 0,
});

const mk = (size: number, priceEur: number, recommended = false): ProductDto => ({
  id: `instant-${size}`,
  slug: `instant-${size / 1000}k`,
  type: 'INSTANT',
  accountSizeMinor: String(size * 100),
  accountCurrency: 'USD',
  priceMinor: String(priceEur * 100),
  priceCurrency: 'EUR',
  isRecommended: recommended,
  rules: rules(600),
});

export const exampleProducts: ProductDto[] = [
  mk(5_000, 59),
  mk(10_000, 99),
  mk(25_000, 199, true),
  mk(50_000, 349),
  mk(100_000, 599),
];

/** Placeholder pricing formula for the custom configurator (server is the source of truth). */
export function exampleQuotePriceMinor(accountSizeMinor: bigint, maxDrawdownBps: number): bigint {
  const base = 2_900n; // €29
  const perThousand = 600n; // €6 per $1k
  const sizeThousands = accountSizeMinor / 100_000n;
  const drawdownFactor = BigInt(maxDrawdownBps); // higher drawdown → pricier
  return base + (sizeThousands * perThousand * drawdownFactor) / 600n;
}
