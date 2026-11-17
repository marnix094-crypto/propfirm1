import type { ProductType } from './enums.js';

/**
 * Wire types for the catalog/public endpoints (docs/api.md).
 * Money: integer strings in minor units (`…Minor`). Percentages: basis points.
 * Replaced by the generated OpenAPI client in phase 5.
 */
export type DrawdownType = 'STATIC' | 'TRAILING';

export interface ProductRulesDto {
  maxDailyLossBps: number;
  maxDrawdownBps: number;
  drawdownType: DrawdownType;
  profitSplitBps: number;
  maxLeverage: number;
  minTradingDays: number;
}

export interface ProductDto {
  id: string;
  slug: string;
  type: ProductType;
  /** Simulated trading capital, USD minor units. */
  accountSizeMinor: string;
  accountCurrency: 'USD';
  /** Fee, minor units of `priceCurrency`. */
  priceMinor: string;
  priceCurrency: 'EUR';
  isRecommended: boolean;
  rules: ProductRulesDto;
}

export interface ProductListResponse {
  items: ProductDto[];
}

export interface PriceQuoteRequest {
  type: ProductType;
  accountSizeMinor: string;
  maxDrawdownBps: number;
}

export interface PriceQuoteResponse {
  quoteId: string;
  priceMinor: string;
  priceCurrency: 'EUR';
  accountSizeMinor: string;
  rules: ProductRulesDto;
  expiresAt: string;
}

/** Anonymised payout (country + rounded amount + time). Only real data; never fabricated. */
export interface PayoutFeedItem {
  id: string;
  countryCode: string;
  amountMinor: string;
  currency: 'USD';
  paidAt: string;
}

export interface PayoutFeedResponse {
  items: PayoutFeedItem[];
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
}
