/**
 * EXAMPLE product catalogue (instant funding only, decision D29/D51). Rows are created at boot
 * when the slug is missing; prices are not the real offer yet. Purchases snapshot size, price
 * and rule-set version, so later catalogue changes never affect existing accounts.
 */
export interface ProductDefinition {
  slug: string;
  accountSizeMinor: bigint;
  priceMinor: bigint;
  ruleSetCode: string;
  isRecommended?: boolean;
}

const instant = (sizeUsd: number, priceEur: number, isRecommended = false): ProductDefinition => ({
  slug: `instant-${sizeUsd / 1000}k`,
  accountSizeMinor: BigInt(sizeUsd) * 100n,
  priceMinor: BigInt(priceEur) * 100n,
  ruleSetCode: 'INSTANT_EXAMPLE',
  isRecommended,
});

export const PRODUCT_CATALOG: ProductDefinition[] = [
  instant(5_000, 59),
  instant(10_000, 99),
  instant(25_000, 199, true),
  instant(50_000, 349),
  instant(100_000, 599),
];

/** Custom configurator limits (USD minor units). */
export const CUSTOM_SIZE = { minMinor: 500_000n, maxMinor: 20_000_000n, stepMinor: 500_000n };
export const QUOTE_TTL_MS = 30 * 60_000;
export const MAX_QUANTITY = 5;
