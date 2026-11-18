import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { normalizeDecimalInput, decimalsOf, formatDecimal } from '@/lib/decimal';
import { safeNext } from '@/features/auth/login-page';
import { marginHealth } from '@/features/portfolio/portfolio-page';
import { useQuotes } from '@/stores/trading';
import { renderWithProviders } from '@/test/render';
import { OrderForm, specFrom } from '../order-form';
import type { Account, Instrument } from '@/lib/api-client';

const BTC: Instrument = {
  symbol: 'BTCUSDT',
  displayName: 'Bitcoin',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceDecimals: 1,
  qtyDecimals: 3,
  tickSize: '0.1',
  minQty: '0.001',
  qtyStep: '0.001',
  maxLeverage: 100,
  commissionBps: 4,
};

const account: Account = {
  id: '00000000-0000-7000-8000-000000000001',
  kind: 'DEMO',
  label: 'Demo',
  status: 'ACTIVE',
  isSimulated: true,
  currency: 'USD',
  initialBalanceMinor: '10000000',
  balanceMinor: '10000000',
  equityMinor: '10000000',
  unrealizedPnlMinor: '0',
  usedMarginMinor: '0',
  freeMarginMinor: '10000000',
  marginLevelBps: null,
  dailyPnlMinor: '0',
  maxLeverage: 50,
  seq: '0',
  hasRules: false,
  failReason: null,
};

describe('decimal input helpers', () => {
  it.each([
    ['0,15', '0.15'],
    ['00012.5', '12.5'],
    ['.5', '0.5'],
    ['1.', '1.'],
    ['abc', null],
    ['1e5', null],
    ['', null],
  ])('normalize %s → %s', (input, out) => {
    expect(normalizeDecimalInput(input)).toBe(out === '1.' ? '1' : out);
  });
  it('derives decimals from a step', () => {
    expect(decimalsOf('0.001')).toBe(3);
    expect(decimalsOf('1')).toBe(0);
  });
  it('formats exact decimal strings per locale', () => {
    expect(formatDecimal('67012.35', 2, 'nl-NL')).toBe('67.012,35');
    expect(formatDecimal(null, 2, 'en-US')).toBe('—');
  });
});

describe('safeNext (open-redirect protection)', () => {
  it('allows only in-app paths', () => {
    expect(safeNext('/en/app/trade/BTCUSDT', 'en')).toBe('/en/app/trade/BTCUSDT');
    expect(safeNext('https://evil.example', 'en')).toBe('/en/app');
    expect(safeNext('//evil.example', 'en')).toBe('/en/app');
    expect(safeNext(null, 'nl')).toBe('/nl/app');
  });
});

describe('marginHealth', () => {
  it('is 100 without margin and drops as margin is used', () => {
    expect(marginHealth({ equityMinor: '10000000', usedMarginMinor: '0' })).toBe(100);
    expect(marginHealth({ equityMinor: '10000000', usedMarginMinor: '2500000' })).toBe(75);
    expect(marginHealth({ equityMinor: '0', usedMarginMinor: '100' })).toBe(0);
  });
});

describe('OrderForm', () => {
  it('builds an exact spec from the API instrument', () => {
    expect(specFrom(BTC)).toMatchObject({
      tickSize: 1n,
      minQty: 1n,
      qtyStep: 1n,
      commissionBps: 4,
    });
  });

  it('estimates value, margin and fee exactly and sizes 100% within free margin', async () => {
    useQuotes.getState().put('BTCUSDT', { bid: '60000.0', ask: '60000.0', ts: Date.now() });
    renderWithProviders(<OrderForm instrument={BTC} account={account} />);
    await userEvent.type(screen.getByLabelText('Size'), '0.100');
    expect(screen.getByText('$6,000.00')).toBeInTheDocument(); // value
    expect(screen.getByText('$600.00')).toBeInTheDocument(); // margin at 1:10
    expect(screen.getByText('$2.40')).toBeInTheDocument(); // 4 bps fee

    await userEvent.click(screen.getByRole('button', { name: '100%' }));
    // $100,000 free, 1:10, 4 bps fee → ≤ 16.6 BTC; floored to the 0.001 step.
    const qty = (screen.getByLabelText('Size') as HTMLInputElement).value;
    expect(qty).toBe('16.600');
  });
});
