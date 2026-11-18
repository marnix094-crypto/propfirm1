import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { parseDecimalRounded, toDecimalString } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PriceChart, type PriceLineSpec } from '@/components/charts/price-chart';
import {
  useActiveAccount,
  useCandles,
  useInstruments,
  useOrders,
  usePositions,
  useTickers,
  useWatchlist,
  type Timeframe,
} from '@/hooks/use-trading';
import { useLiveSymbols } from '@/hooks/use-realtime';
import { useFormat } from '@/hooks/use-format';
import { call, client, type Instrument } from '@/lib/api-client';
import { formatDecimal } from '@/lib/decimal';
import { cn } from '@/lib/cn';
import { ChangeBadge, useLivePrice } from '../portfolio/markets-list';
import { InstrumentPicker } from './instrument-picker';
import { OrderForm } from './order-form';
import { PositionsPanel } from './positions-panel';
import { AccountClosedBanner, isTradable } from '../rules/rules-card';

const TFS: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

function Specs({ inst }: { inst: Instrument }) {
  const { t } = useTranslation();
  const f = useFormat();
  const quote = useQuery({
    queryKey: ['quote', inst.symbol],
    queryFn: () =>
      call(() =>
        client.GET('/api/v1/instruments/{symbol}/quote', {
          params: { path: { symbol: inst.symbol } },
        }),
      ),
    refetchInterval: 10_000,
    retry: false,
  });
  const status = useQuery({
    queryKey: ['market-status'],
    queryFn: () => call(() => client.GET('/api/v1/market/status')),
    refetchInterval: 30_000,
  });
  // Funding rate (8-decimal string) → percent, exact.
  const funding = quote.data?.fundingRate
    ? `${formatDecimal(toDecimalString(parseDecimalRounded(quote.data.fundingRate, 8) * 100n, 8), 4, f.locale)}%`
    : '—';
  const rows: [string, string][] = [
    ['tickSize', inst.tickSize],
    ['minQty', `${inst.minQty} ${inst.baseAsset}`],
    ['maxLeverage', f.leverage(inst.maxLeverage)],
    ['commission', f.bps(inst.commissionBps)],
    ['funding', funding],
    [
      'source',
      status.data?.source === 'simulated'
        ? t('app.trade.specs.simulated')
        : t('app.trade.specs.live'),
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-muted">{t(`app.trade.specs.${k}`)}</dt>
          <dd className="font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TradePage() {
  const { t } = useTranslation();
  const { lang, symbol: param } = useParams();
  const f = useFormat();
  const instruments = useInstruments();
  const { account } = useActiveAccount();
  const watchlist = useWatchlist();
  const tickers = useTickers();
  const [tf, setTf] = useState<Timeframe>('15m');
  const [view, setView] = useState('chart');
  const [sheet, setSheet] = useState(false);

  const inst = instruments.data?.find((i) => i.symbol === param?.toUpperCase());
  const symbol = inst?.symbol ?? '';
  useLiveSymbols(symbol ? [symbol] : []);
  const candles = useCandles(symbol || 'BTCUSDT', tf);
  const positions = usePositions(account?.id);
  const openOrders = useOrders(account?.id, 'open');
  const ticker = tickers.data?.find((x) => x.symbol === symbol);
  const price = useLivePrice(symbol, ticker?.last, inst?.priceDecimals ?? 2);

  const lines: PriceLineSpec[] = [];
  {
    const out = lines;
    const pos = positions.data?.find((p) => p.symbol === symbol);
    if (pos) {
      out.push({
        price: pos.avgEntryPrice,
        title: `${t(`app.trade.${pos.side}`)} ${pos.qty}`,
        kind: 'entry',
      });
      if (pos.slPrice) out.push({ price: pos.slPrice, title: 'SL', kind: 'sl' });
      if (pos.tpPrice) out.push({ price: pos.tpPrice, title: 'TP', kind: 'tp' });
    }
    for (const o of openOrders.data ?? []) {
      if (o.symbol !== symbol) continue;
      const px = o.limitPrice ?? o.stopPrice;
      if (px) out.push({ price: px, title: `${t(`app.trade.${o.type}`)} ${o.qty}`, kind: 'order' });
    }
  }

  if (instruments.isPending) return <Skeleton className="h-96" />;
  if (instruments.isError)
    return (
      <ErrorState
        title={t('errors.generic')}
        retryLabel={t('common.retry')}
        onRetry={() => void instruments.refetch()}
      />
    );
  if (!inst) {
    const fallback = watchlist.symbols[0] ?? instruments.data[0]?.symbol ?? 'BTCUSDT';
    return <Navigate to={`/${lang}/app/trade/${fallback}`} replace />;
  }
  const fav = watchlist.symbols.includes(inst.symbol);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
      <title>{`${inst.baseAsset} · ${t('app.nav.trade')}`}</title>
      <h1 className="sr-only">{`${inst.displayName} (${inst.symbol})`}</h1>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-3">
          <InstrumentPicker current={inst} />
          <div className="ml-auto text-right">
            <p className="text-xl font-bold tabular-nums" data-testid="last-price">
              {formatDecimal(price, inst.priceDecimals, f.locale)}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-muted">
              {t('app.trade.change24h')}{' '}
              <ChangeBadge bps={ticker?.changeBps} className="min-w-0 px-2 py-0.5" />
            </div>
          </div>
          <button
            type="button"
            onClick={() => watchlist.toggle(inst.symbol)}
            aria-pressed={fav}
            aria-label={t(fav ? 'app.portfolio.removeFavorite' : 'app.portfolio.addFavorite', {
              symbol: inst.baseAsset,
            })}
            className="inline-flex size-11 items-center justify-center rounded-[14px] border border-border bg-card"
          >
            <Star
              className={cn('size-5', fav && 'fill-[var(--meter-warn)] text-[var(--meter-warn)]')}
              aria-hidden="true"
            />
          </button>
        </div>

        {account && <AccountClosedBanner account={account} />}

        <Card padding="none" className="overflow-hidden">
          <Tabs
            label={t('app.trade.chart')}
            value={view}
            onValueChange={setView}
            className="flex flex-col"
            listWrapperClassName="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3"
            header={null}
            items={[
              { value: 'chart', label: t('app.trade.chart') },
              { value: 'info', label: t('app.trade.info') },
            ]}
          >
            <TabsContent value="chart" forceMount className="data-[state=inactive]:hidden">
              <div
                role="radiogroup"
                aria-label={t('app.trade.timeframe')}
                className="flex gap-1 overflow-x-auto px-3 pt-3"
              >
                {TFS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={tf === x}
                    onClick={() => setTf(x)}
                    className={cn(
                      'h-8 rounded-[10px] px-3 text-sm font-semibold',
                      tf === x ? 'bg-primary-tint/60 text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <div className="relative h-[46dvh] min-h-72 px-1 pb-2 lg:h-[52dvh]">
                {candles.isError ? (
                  <ErrorState
                    title={t('app.trade.chartError')}
                    retryLabel={t('common.retry')}
                    onRetry={() => void candles.refetch()}
                  />
                ) : candles.isPending ? (
                  <Skeleton className="absolute inset-3" />
                ) : (
                  <PriceChart
                    symbol={inst.symbol}
                    tf={tf}
                    candles={candles.data}
                    priceDecimals={inst.priceDecimals}
                    lines={lines}
                    label={t('app.trade.chartLabel', { symbol: inst.symbol })}
                    className="size-full"
                  />
                )}
              </div>
            </TabsContent>
            <TabsContent value="info">
              <Specs inst={inst} />
            </TabsContent>
          </Tabs>
        </Card>

        {account && (
          <Card padding="md">
            <PositionsPanel account={account} />
          </Card>
        )}
      </div>

      {/* Desktop: order panel on the right. */}
      <aside className="hidden lg:block">
        {account && (
          <Card padding="md" className="sticky top-20">
            <h2 className="mb-4 text-lg font-semibold">{t('app.trade.orderTitle')}</h2>
            {isTradable(account) ? (
              <OrderForm instrument={inst} account={account} />
            ) : (
              <p className="text-sm text-muted">{t('app.rules.cannotTrade')}</p>
            )}
          </Card>
        )}
      </aside>

      {/* Space so the floating order button never covers the last rows on mobile. */}
      <div aria-hidden="true" className="h-16 lg:hidden" />
      {/* Mobile: sticky button opens the order sheet. */}
      {account && isTradable(account) && (
        <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-4 lg:hidden">
          <Sheet
            open={sheet}
            onOpenChange={setSheet}
            title={`${t('app.trade.orderTitle')} · ${inst.baseAsset}`}
            closeLabel={t('common.close')}
            trigger={
              <Button size="lg" fullWidth className="shadow-float">
                {t('app.trade.placeOrder')}
              </Button>
            }
          >
            <OrderForm instrument={inst} account={account} onDone={() => setSheet(false)} />
          </Sheet>
        </div>
      )}
    </div>
  );
}
