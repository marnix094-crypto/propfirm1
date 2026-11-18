import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import {
  backtestEquity,
  closeBacktest,
  fromDecimalString,
  newBacktest,
  openBacktest,
  toDecimalString,
  tradeStats,
  type BacktestState,
} from '@brand/engine';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { PageHeader, Panel } from '@/components/ui/panel';
import { StatTile } from '@/components/ui/stat';
import { Tabs } from '@/components/ui/tabs';
import { PriceChart } from '@/components/charts/price-chart';
import { useCandles, useInstruments } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { specFrom } from '../trade/order-form';
import { StatsPanel } from '../portfolio/stats-panel';

const TFS = ['15m', '1h', '4h'] as const;
type Tf = (typeof TFS)[number];
const START_BALANCE = 1_000_000n; // $10,000 virtual
const WARMUP = 60; // bars visible before the replay starts
const SPEEDS = [1, 2, 5] as const;

const dayKey = (t: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));

/**
 * Back Testing: replay historical candles bar by bar and trade them with virtual money.
 * Fills at the bar's close, with the instrument's commission (engine/backtest). Nothing is saved.
 */
export function BacktestingPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const instruments = useInstruments();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState<Tf>('1h');
  const candles = useCandles(symbol, tf);
  const inst = instruments.data?.find((i) => i.symbol === symbol);
  const spec = useMemo(() => (inst ? specFrom(inst) : null), [inst]);
  const [cursor, setCursor] = useState(WARMUP);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [state, setState] = useState<BacktestState>(() => newBacktest(START_BALANCE));
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);
  const all = useMemo(() => candles.data ?? [], [candles.data]);
  const visible = useMemo(() => all.slice(0, cursor), [all, cursor]);
  const bar = visible.at(-1);
  const price = bar && spec ? fromDecimalString(bar.c, spec.priceDecimals) : null;
  const finished = cursor >= all.length;

  const reset = () => {
    setPlaying(false);
    setCursor(Math.min(WARMUP, all.length));
    setState(newBacktest(START_BALANCE));
    setError(null);
  };
  // New data set → restart the session (state adjusted during render, React's pattern).
  const key = `${symbol}-${tf}-${all.length}`;
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setPlaying(false);
    setCursor(Math.min(WARMUP, all.length));
    setState(newBacktest(START_BALANCE));
    setError(null);
  }

  // Playback stops by itself at the last candle.
  const running = playing && !finished;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setCursor((c) => c + 1), 700 / speed);
    return () => window.clearTimeout(id);
  }, [running, cursor, speed]);

  const trade = (side: 'LONG' | 'SHORT') => {
    if (!spec || !bar || price === null) return;
    try {
      const q = fromDecimalString(
        qty || toDecimalString(spec.minQty * 10n, spec.qtyDecimals),
        spec.qtyDecimals,
      );
      setState((s) => openBacktest(s, side, q, price, bar.t, dayKey(bar.t), spec));
      setError(null);
    } catch {
      setError(t('backtest.invalidSize'));
    }
  };
  const close = () => {
    if (!spec || !bar || price === null) return;
    setState((s) => closeBacktest(s, price, bar.t, dayKey(bar.t), spec));
  };

  const stats = useMemo(() => tradeStats(state.trades), [state.trades]);
  const equity = spec && price !== null ? backtestEquity(state, price, spec) : state.balanceMinor;
  const ret = equity - START_BALANCE;
  const s = (v: bigint | null) => (v === null ? null : v.toString());

  if (instruments.isPending || candles.isPending) return <Skeleton className="h-96" />;
  if (instruments.isError || candles.isError || !spec)
    return (
      <ErrorState
        title={t('errors.generic')}
        retryLabel={t('common.retry')}
        onRetry={() => void candles.refetch()}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.backtesting')} subtitle={t('backtest.subtitle')} />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t('backtest.market')}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="w-40"
        >
          {(instruments.data ?? []).map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.symbol}
            </option>
          ))}
        </Select>
        <Tabs
          label={t('app.trade.timeframe')}
          value={tf}
          onValueChange={(v) => setTf(v as Tf)}
          items={TFS.map((x) => ({ value: x, label: x }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('backtest.equity')} value={f.money(equity, 'USD')} testId="bt-equity" />
        <StatTile
          label={t('backtest.result')}
          value={f.money(ret, 'USD', { signDisplay: 'exceptZero' })}
          tone={ret > 0n ? 'profit' : ret < 0n ? 'loss' : undefined}
        />
        <StatTile
          label={t('backtest.position')}
          value={
            state.position
              ? `${t(`app.trade.${state.position.side}`)} ${toDecimalString(state.position.qty, spec.qtyDecimals)}`
              : '—'
          }
        />
        <StatTile
          label={t('backtest.progress')}
          value={`${Math.min(cursor, all.length)} / ${all.length}`}
          sub={
            bar
              ? new Intl.DateTimeFormat(f.locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(bar.t))
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title={`${symbol} · ${tf}`}
            actions={
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" aria-label={t('backtest.reset')} onClick={reset}>
                  <RotateCcw aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('backtest.step')}
                  disabled={finished}
                  onClick={() => setCursor((c) => c + 1)}
                >
                  <StepForward aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  disabled={finished}
                  onClick={() => setPlaying((p) => !p)}
                  data-testid="bt-play"
                >
                  {running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                  {running ? t('backtest.pause') : t('backtest.play')}
                </Button>
                <select
                  aria-label={t('backtest.speed')}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}
                  className="h-8 rounded-sm border border-border bg-card px-2 text-sm"
                >
                  {SPEEDS.map((x) => (
                    <option key={x} value={x}>
                      {x}×
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            <PriceChart
              symbol={symbol}
              tf={tf}
              candles={visible}
              priceDecimals={spec.priceDecimals}
              lines={
                state.position
                  ? [
                      {
                        price: toDecimalString(state.position.entryPrice, spec.priceDecimals),
                        title: t('backtest.entry'),
                        kind: 'entry',
                      },
                    ]
                  : []
              }
              label={t('backtest.chartLabel', { symbol })}
              className="h-72 w-full sm:h-96"
              live={false}
            />
          </Panel>

          <Panel title={t('backtest.trades')}>
            {state.trades.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">{t('backtest.noTrades')}</p>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[480px] text-sm">
                  <tbody>
                    {[...state.trades].reverse().map((tr, i) => (
                      <tr key={i} className="border-t border-border first:border-t-0">
                        <td className="px-5 py-2.5 font-medium">
                          {t(`app.trade.${tr.side}`)} {toDecimalString(tr.qty, spec.qtyDecimals)}
                        </td>
                        <td className="px-5 py-2.5 text-muted tabular-nums">
                          {toDecimalString(tr.entryPrice, spec.priceDecimals)} →{' '}
                          {toDecimalString(tr.exitPrice, spec.priceDecimals)}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-2.5 text-right font-semibold tabular-nums',
                            tr.netPnlMinor > 0n ? 'text-profit' : 'text-loss',
                          )}
                        >
                          {f.money(tr.netPnlMinor, 'USD', { signDisplay: 'exceptZero' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={t('backtest.order')} bodyClassName="flex flex-col gap-3 p-5">
            <Input
              label={t('app.trade.size')}
              inputMode="decimal"
              placeholder={toDecimalString(spec.minQty * 10n, spec.qtyDecimals)}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              suffix={symbol.replace('USDT', '')}
            />
            {error && (
              <p role="alert" className="text-sm text-loss">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(
                  'inline-flex h-11 items-center justify-center rounded-btn text-sm font-bold text-[var(--on-trade-action)] transition-[filter] hover:brightness-110 disabled:opacity-50',
                  'bg-[var(--buy-bg)]',
                )}
                disabled={!bar}
                onClick={() => trade('LONG')}
              >
                {t('backtest.buy')}
              </button>
              <button
                type="button"
                className={cn(
                  'inline-flex h-11 items-center justify-center rounded-btn text-sm font-bold text-[var(--on-trade-action)] transition-[filter] hover:brightness-110 disabled:opacity-50',
                  'bg-[var(--sell-bg)]',
                )}
                disabled={!bar}
                onClick={() => trade('SHORT')}
              >
                {t('backtest.sell')}
              </button>
            </div>
            <Button variant="secondary" disabled={!state.position} onClick={close}>
              {t('backtest.close')}
            </Button>
            <p className="text-xs text-muted">{t('backtest.note')}</p>
          </Panel>
          <StatsPanel
            currency="USD"
            stats={{
              trades: stats.trades,
              wins: stats.wins,
              losses: stats.losses,
              winRateBps: stats.winRateBps,
              grossProfitMinor: stats.grossProfitMinor.toString(),
              grossLossMinor: stats.grossLossMinor.toString(),
              netPnlMinor: stats.netPnlMinor.toString(),
              avgWinMinor: s(stats.avgWinMinor),
              avgLossMinor: s(stats.avgLossMinor),
              profitFactorBps: stats.profitFactorBps,
              expectancyMinor: s(stats.expectancyMinor),
              bestTradeMinor: s(stats.bestTradeMinor),
              worstTradeMinor: s(stats.worstTradeMinor),
            }}
          />
        </div>
      </div>
    </div>
  );
}
