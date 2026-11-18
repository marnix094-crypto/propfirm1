import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Meter } from '@/components/ui/meter';
import { PriceChart } from '@/components/charts/price-chart';
import { useFormat } from '@/hooks/use-format';
import { realtime } from '@/lib/realtime';
import { cn } from '@/lib/cn';
import { useQuote } from '@/stores/trading';
import { competeCall, competeClient, type CompeteEntry } from './api';
import { useClosePosition, useEntryOrders, usePlaceCompeteOrder } from './hooks';
import { useCompeteError } from './auth-pages';

/** Shared market data (read-only): instruments and candles via the compete client. */
function useMarket(symbol: string) {
  const instruments = useQuery({
    queryKey: ['compete', 'instruments'],
    queryFn: () => competeCall(() => competeClient.GET('/api/v1/instruments')),
    staleTime: 60 * 60_000,
  });
  const candles = useQuery({
    queryKey: ['compete', 'candles', symbol],
    queryFn: () =>
      competeCall(() =>
        competeClient.GET('/api/v1/instruments/{symbol}/candles', {
          params: { path: { symbol }, query: { tf: '1m', limit: 240 } },
        }),
      ),
    staleTime: 30_000,
  });
  return { instruments, candles };
}

/** Equity, return and the static drawdown floor of the player's entry. */
export function EntryStats({ entry, currency }: { entry: CompeteEntry; currency: string }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const ret = Number(entry.returnBps);
  const start = BigInt(entry.startBalanceMinor);
  const equity = BigInt(entry.equityMinor);
  const floor = BigInt(entry.floorMinor);
  const loss = start > equity ? start - equity : 0n;
  return (
    <Card padding="lg" className="grid gap-6 sm:grid-cols-3">
      <div>
        <p className="text-xs text-muted">{t('terminal.equity')}</p>
        <p
          className="mt-1 font-display text-3xl font-bold tabular-nums"
          data-testid="compete-equity"
        >
          {f.money(entry.equityMinor, currency)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted">{t('terminal.return')}</p>
        <p
          className={cn(
            'mt-1 font-display text-3xl font-bold tabular-nums',
            ret > 0 ? 'text-profit' : ret < 0 ? 'text-loss' : '',
          )}
        >
          {(ret > 0 ? '+' : '') + f.bps(ret)}
        </p>
      </div>
      <Meter
        label={t('terminal.drawdown')}
        used={loss}
        limit={start - floor}
        usedLabel={f.money(loss, currency)}
        limitLabel={f.money(start - floor, currency)}
        stateLabels={{ safe: t('meter.safe'), warn: t('meter.warn'), breach: t('meter.breach') }}
      />
    </Card>
  );
}

/** Market-order terminal for a live entry: chart, ticket, positions and fills. */
export function CompeteTerminal({
  entry,
  currency,
  leverage,
}: {
  entry: CompeteEntry;
  currency: string;
  leverage: number;
}) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const toMessage = useCompeteError();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [qty, setQty] = useState('0.100');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const { instruments, candles } = useMarket(symbol);
  const quote = useQuote(symbol);
  const place = usePlaceCompeteOrder(entry.id);
  const close = useClosePosition(entry.id);
  const orders = useEntryOrders(entry.id);
  const inst = instruments.data?.find((i) => i.symbol === symbol);
  const symbols = useMemo(() => instruments.data?.map((i) => i.symbol) ?? [], [instruments.data]);

  useEffect(() => realtime.watchSymbols(symbols.length ? symbols : [symbol]), [symbols, symbol]);

  const submit = (side: 'BUY' | 'SELL') => async (e?: FormEvent) => {
    e?.preventDefault();
    setMsg(null);
    try {
      await place.mutateAsync({ symbol, side, qty });
      setMsg({
        kind: 'ok',
        text: t('terminal.filled', { side: t(`terminal.${side}`), qty, symbol }),
      });
    } catch (err) {
      setMsg({ kind: 'err', text: toMessage(err) });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{inst?.displayName ?? symbol}</span>
            <span className="text-xs text-muted">{symbol}</span>
          </div>
          <div className="flex gap-4 text-sm tabular-nums" aria-live="off">
            <span>
              <span className="text-muted">{t('terminal.bid')} </span>
              <span className="font-semibold text-loss">{quote?.bid ?? '—'}</span>
            </span>
            <span>
              <span className="text-muted">{t('terminal.ask')} </span>
              <span className="font-semibold text-profit">{quote?.ask ?? '—'}</span>
            </span>
          </div>
        </div>
        {candles.data && inst ? (
          <PriceChart
            symbol={symbol}
            tf="1m"
            candles={candles.data}
            priceDecimals={inst.priceDecimals}
            lines={entry.positions
              .filter((p) => p.symbol === symbol)
              .map((p) => ({
                price: p.avgEntryPrice,
                title: t('terminal.entry'),
                kind: 'entry' as const,
              }))}
            label={t('terminal.chart', { symbol })}
            className="h-[340px]"
          />
        ) : (
          <div className="h-[340px] animate-pulse bg-card-muted motion-reduce:animate-none" />
        )}
      </Card>

      <Card padding="lg">
        <form
          onSubmit={submit('BUY')}
          className="flex flex-col gap-4"
          aria-labelledby="ticket-title"
        >
          <h2 id="ticket-title" className="font-semibold">
            {t('terminal.ticket')}
          </h2>
          <Select
            label={t('terminal.symbol')}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {(instruments.data ?? []).map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.displayName} ({i.symbol})
              </option>
            ))}
          </Select>
          <Input
            label={t('terminal.qty')}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(',', '.'))}
            hint={t('terminal.leverageHint', { leverage: f.leverage(leverage) })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => void submit('BUY')()}
              disabled={place.isPending}
              className="bg-[var(--profit)] text-[var(--btn-primary-fg)]"
            >
              {t('terminal.BUY')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void submit('SELL')()}
              disabled={place.isPending}
              className="border-loss text-loss"
            >
              {t('terminal.SELL')}
            </Button>
          </div>
          <p
            role="status"
            className={cn('min-h-5 text-sm', msg?.kind === 'err' ? 'text-loss' : 'text-muted')}
          >
            {msg?.text}
          </p>
        </form>
      </Card>

      <Card padding="none" className="overflow-hidden xl:col-span-2">
        <h2 className="border-b border-border px-5 py-3 font-semibold">
          {t('terminal.positions')}
        </h2>
        {entry.positions.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('terminal.noPositions')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-2 font-semibold">{t('terminal.symbol')}</th>
                  <th className="py-2 font-semibold">{t('terminal.side')}</th>
                  <th className="py-2 text-right font-semibold">{t('terminal.qty')}</th>
                  <th className="py-2 text-right font-semibold">{t('terminal.entry')}</th>
                  <th className="py-2 text-right font-semibold">{t('terminal.pnl')}</th>
                  <th className="px-5 py-2 text-right font-semibold">
                    <span className="sr-only">{t('terminal.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entry.positions.map((p) => {
                  const pnl = BigInt(p.unrealizedPnlMinor);
                  return (
                    <tr key={p.symbol} className="border-t border-border">
                      <td className="px-5 py-2.5 font-medium">{p.symbol}</td>
                      <td
                        className={cn(
                          'py-2.5 font-semibold',
                          p.side === 'LONG' ? 'text-profit' : 'text-loss',
                        )}
                      >
                        {t(`terminal.${p.side}`)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{p.qty}</td>
                      <td className="py-2.5 text-right tabular-nums">{p.avgEntryPrice}</td>
                      <td
                        className={cn(
                          'py-2.5 text-right font-semibold tabular-nums',
                          pnl > 0n ? 'text-profit' : pnl < 0n ? 'text-loss' : '',
                        )}
                      >
                        {f.money(pnl, currency, { signDisplay: 'exceptZero' })}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={close.isPending}
                          onClick={() => close.mutate(p.symbol)}
                        >
                          {t('terminal.close')}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {orders.data && orders.data.length > 0 && (
          <details className="border-t border-border px-5 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              {t('terminal.fills', { count: orders.data.length })}
            </summary>
            <ul className="mt-3 flex flex-col gap-1.5 text-muted">
              {orders.data.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 tabular-nums">
                  <span>
                    {t(`terminal.${o.side}`)} {o.qty} {o.symbol} @ {o.price}
                    {o.reason !== 'PLAYER' && ` · ${t(`terminal.reason.${o.reason}`)}`}
                  </span>
                  <span>{new Date(o.createdAt).toLocaleTimeString(f.locale)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  );
}
