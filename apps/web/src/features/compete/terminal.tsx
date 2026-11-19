import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fromDecimalString, toDecimalString } from '@brand/engine';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Meter } from '@/components/ui/meter';
import { PriceChart } from '@/components/charts/price-chart';
import { useFormat } from '@/hooks/use-format';
import { realtime } from '@/lib/realtime';
import { cn } from '@/lib/cn';
import { useQuote } from '@/stores/trading';
import { competeCall, competeClient, type CompeteEntry } from './api';
import { useClosePosition, useEntryOrders, usePlaceCompeteOrder } from './hooks';
import { useCompeteError } from './auth-pages';
import { ReturnText } from './arena-ui';

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

/** Parses a decimal string to fixed point; null when invalid. */
function scaled(v: string | undefined, decimals: number): bigint | null {
  if (!v) return null;
  try {
    return fromDecimalString(v, decimals);
  } catch {
    return null;
  }
}

/**
 * Account strip of a live entry: equity, return, rank and the static loss limit.
 * One card so the player sees "how am I doing" in a single glance.
 */
export function EntryStats({
  entry,
  currency,
  rank,
  participants,
}: {
  entry: CompeteEntry;
  currency: string;
  rank?: number;
  participants?: number;
}) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const start = BigInt(entry.startBalanceMinor);
  const equity = BigInt(entry.equityMinor);
  const floor = BigInt(entry.floorMinor);
  const loss = start > equity ? start - equity : 0n;
  return (
    <Card
      padding="none"
      className="grid grid-cols-2 gap-px overflow-hidden bg-border xl:grid-cols-[1.35fr_1fr_1fr_1.4fr]"
    >
      <div className="bg-card p-4 sm:p-5">
        <p className="text-xs font-medium text-muted">{t('terminal.equity')}</p>
        <p
          className="mt-1 font-display text-xl font-bold tabular-nums sm:text-[28px]"
          data-testid="compete-equity"
        >
          {f.money(entry.equityMinor, currency)}
        </p>
      </div>
      <div className="bg-card p-4 sm:p-5">
        <p className="text-xs font-medium text-muted">{t('terminal.return')}</p>
        <ReturnText
          bps={entry.returnBps}
          className="mt-1 block font-display text-xl font-bold sm:text-[28px]"
        />
      </div>
      <div className="bg-card p-4 sm:p-5">
        <p className="text-xs font-medium text-muted">{t('terminal.rank')}</p>
        <p className="mt-1 font-display text-xl font-bold tabular-nums sm:text-[28px]">
          {rank ? `#${rank}` : '—'}
          {participants ? (
            <span className="ml-1.5 text-sm font-medium text-muted">
              {t('terminal.ofPlayers', { n: participants })}
            </span>
          ) : null}
        </p>
      </div>
      <Meter
        className="bg-card p-4 sm:p-5"
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

const PRESETS_BPS = [1000, 2500, 5000] as const;

/** Market-order terminal for a live entry: instruments, chart + ticket, positions and fills. */
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
  const [tab, setTab] = useState<'positions' | 'fills'>('positions');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const { instruments, candles } = useMarket(symbol);
  const quote = useQuote(symbol);
  const place = usePlaceCompeteOrder(entry.id);
  const close = useClosePosition(entry.id);
  const orders = useEntryOrders(entry.id);
  const inst = instruments.data?.find((i) => i.symbol === symbol);
  const symbols = useMemo(() => instruments.data?.map((i) => i.symbol) ?? [], [instruments.data]);

  useEffect(() => realtime.watchSymbols(symbols.length ? symbols : [symbol]), [symbols, symbol]);

  // Order value and margin (display only, fixed point → cents).
  const est = useMemo(() => {
    if (!inst || !quote) return null;
    const q = scaled(qty, inst.qtyDecimals);
    const p = scaled(quote.ask, inst.priceDecimals);
    if (q === null || p === null || q <= 0n) return null;
    const scale = 10n ** BigInt(inst.qtyDecimals + inst.priceDecimals);
    const notional = (q * p * 100n) / scale;
    return { notional, margin: notional / BigInt(Math.max(1, leverage)) };
  }, [inst, quote, qty, leverage]);

  /** Quantity worth a share of the buying power (equity × leverage), rounded down to the step. */
  const presetQty = (bps: number) => {
    if (!inst || !quote) return null;
    const p = scaled(quote.ask, inst.priceDecimals);
    const step = scaled(inst.qtyStep, inst.qtyDecimals);
    if (!p || !step) return null;
    const power = (BigInt(entry.equityMinor) * BigInt(leverage) * BigInt(bps)) / 10_000n;
    const raw = (power * 10n ** BigInt(inst.qtyDecimals + inst.priceDecimals)) / (p * 100n);
    const q = (raw / step) * step;
    return q > 0n ? toDecimalString(q, inst.qtyDecimals) : null;
  };

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
    <div className="flex flex-col gap-4">
      <Card padding="none" className="overflow-hidden">
        {/* Instruments */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div
            className="-mx-1 flex gap-1 overflow-x-auto px-1"
            role="group"
            aria-label={t('terminal.symbol')}
          >
            {(instruments.data ?? []).map((i) => (
              <button
                key={i.symbol}
                type="button"
                aria-pressed={i.symbol === symbol}
                onClick={() => setSymbol(i.symbol)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
                  i.symbol === symbol
                    ? 'bg-primary text-[var(--btn-primary-fg)]'
                    : 'text-muted hover:bg-card-muted hover:text-fg',
                )}
              >
                {i.baseAsset}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm tabular-nums" aria-live="off">
            <span className="hidden font-semibold sm:inline">{inst?.displayName ?? symbol}</span>
            <span className="rounded-[10px] bg-card-muted px-2.5 py-1">
              <span className="text-xs text-muted">{t('terminal.bid')} </span>
              <span className="font-semibold text-loss">{quote?.bid ?? '—'}</span>
            </span>
            <span className="rounded-[10px] bg-card-muted px-2.5 py-1">
              <span className="text-xs text-muted">{t('terminal.ask')} </span>
              <span className="font-semibold text-profit">{quote?.ask ?? '—'}</span>
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
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
              className="h-[300px] sm:h-[420px]"
            />
          ) : (
            <div className="h-[300px] animate-pulse bg-card-muted motion-reduce:animate-none sm:h-[420px]" />
          )}

          {/* Ticket */}
          <form
            onSubmit={submit('BUY')}
            className="flex flex-col gap-4 border-t border-border p-5 lg:border-t-0 lg:border-l"
            aria-labelledby="ticket-title"
          >
            <div>
              <h2 id="ticket-title" className="font-semibold">
                {t('terminal.ticket')}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {t('terminal.leverageHint', { leverage: f.leverage(leverage) })}
              </p>
            </div>
            <Input
              label={t('terminal.qtyOf', { asset: inst?.baseAsset ?? '' })}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(',', '.'))}
            />
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label={t('terminal.presets')}
            >
              {PRESETS_BPS.map((bps) => {
                const v = presetQty(bps);
                return (
                  <button
                    key={bps}
                    type="button"
                    disabled={!v}
                    onClick={() => v && setQty(v)}
                    className="rounded-[10px] border border-border py-1.5 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-fg disabled:opacity-50"
                    aria-label={t('terminal.presetLabel', { pct: f.bps(bps, 0) })}
                  >
                    {f.bps(bps, 0)}
                  </button>
                );
              })}
            </div>
            <dl className="grid gap-1.5 rounded-[12px] bg-card-muted/60 p-3 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('terminal.value')}</dt>
                <dd className="font-semibold tabular-nums">
                  {est ? f.money(est.notional, currency) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('terminal.margin')}</dt>
                <dd className="font-semibold tabular-nums">
                  {est ? f.money(est.margin, currency) : '—'}
                </dd>
              </div>
            </dl>
            <div className="mt-auto grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="lg"
                onClick={() => void submit('BUY')()}
                disabled={place.isPending}
                className="flex-col gap-0 bg-[var(--profit)] text-[var(--btn-primary-fg)]"
              >
                {t('terminal.BUY')}
                <span
                  aria-hidden="true"
                  className="text-[11px] font-medium tabular-nums opacity-80"
                >
                  {quote?.ask ?? ''}
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => void submit('SELL')()}
                disabled={place.isPending}
                className="flex-col gap-0 border-loss text-loss"
              >
                {t('terminal.SELL')}
                <span
                  aria-hidden="true"
                  className="text-[11px] font-medium tabular-nums opacity-80"
                >
                  {quote?.bid ?? ''}
                </span>
              </Button>
            </div>
            <p
              role="status"
              className={cn('min-h-5 text-sm', msg?.kind === 'err' ? 'text-loss' : 'text-muted')}
            >
              {msg?.text}
            </p>
          </form>
        </div>
      </Card>

      {/* Positions / fills */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex gap-1 border-b border-border px-3 py-2" role="tablist">
          {(['positions', 'fills'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`panel-${k}`}
              onClick={() => setTab(k)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                tab === k ? 'bg-card-muted text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {k === 'positions'
                ? `${t('terminal.positions')} (${entry.positions.length})`
                : t('terminal.fills', { count: orders.data?.length ?? 0 })}
            </button>
          ))}
        </div>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === 'positions' ? (
            entry.positions.length === 0 ? (
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
                          <td className="py-2.5">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-bold',
                                p.side === 'LONG'
                                  ? 'bg-[color-mix(in_srgb,var(--profit)_16%,transparent)] text-profit'
                                  : 'bg-[color-mix(in_srgb,var(--loss)_16%,transparent)] text-loss',
                              )}
                            >
                              {t(`terminal.${p.side}`)}
                            </span>
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
            )
          ) : !orders.data || orders.data.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t('terminal.noFills')}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {orders.data.map((o) => (
                <li key={o.id} className="flex justify-between gap-3 px-5 py-2.5 tabular-nums">
                  <span>
                    <span className={o.side === 'BUY' ? 'text-profit' : 'text-loss'}>
                      {t(`terminal.${o.side}`)}
                    </span>{' '}
                    {o.qty} {o.symbol} @ {o.price}
                    {o.reason !== 'PLAYER' && (
                      <span className="text-muted"> · {t(`terminal.reason.${o.reason}`)}</span>
                    )}
                  </span>
                  <span className="text-muted">
                    {new Date(o.createdAt).toLocaleTimeString(f.locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
