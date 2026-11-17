/**
 * Instrument catalogue (decision D9: Binance USDⓈ-M futures). Upserted into the DB at boot.
 * Precision mirrors the exchange filters; costs are our simulation parameters.
 */
export interface InstrumentDefinition {
  symbol: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  priceDecimals: number;
  qtyDecimals: number;
  tickSize: bigint;
  minQty: bigint;
  qtyStep: bigint;
  maxLeverage: number;
  sortOrder: number;
  /** Starting price for the simulated feed only. */
  simReferencePrice: string;
}

const costs = {
  spreadMarkupBps: 2,
  commissionBps: 4,
  slippageBaseBps: 1,
  slippageImpactBpsPer100k: 1,
  slippageMaxBps: 10,
};

export const INSTRUMENT_CATALOG: (InstrumentDefinition & typeof costs)[] = [
  {
    symbol: 'BTCUSDT',
    displayName: 'Bitcoin',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    priceDecimals: 1,
    qtyDecimals: 3,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 100,
    sortOrder: 1,
    simReferencePrice: '67000.0',
    ...costs,
  },
  {
    symbol: 'ETHUSDT',
    displayName: 'Ethereum',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 3,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 100,
    sortOrder: 2,
    simReferencePrice: '3480.00',
    ...costs,
  },
  {
    symbol: 'SOLUSDT',
    displayName: 'Solana',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 0,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    sortOrder: 3,
    simReferencePrice: '171.00',
    ...costs,
  },
  {
    symbol: 'XRPUSDT',
    displayName: 'XRP',
    baseAsset: 'XRP',
    quoteAsset: 'USDT',
    priceDecimals: 4,
    qtyDecimals: 1,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    sortOrder: 4,
    simReferencePrice: '0.5200',
    ...costs,
  },
  {
    symbol: 'BNBUSDT',
    displayName: 'BNB',
    baseAsset: 'BNB',
    quoteAsset: 'USDT',
    priceDecimals: 2,
    qtyDecimals: 2,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    sortOrder: 5,
    simReferencePrice: '590.00',
    ...costs,
  },
  {
    symbol: 'DOGEUSDT',
    displayName: 'Dogecoin',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    priceDecimals: 5,
    qtyDecimals: 0,
    tickSize: 1n,
    minQty: 1n,
    qtyStep: 1n,
    maxLeverage: 50,
    sortOrder: 6,
    simReferencePrice: '0.16000',
    ...costs,
  },
];
