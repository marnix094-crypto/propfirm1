import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle } from '@/lib/api-client';
import { realtime } from '@/lib/realtime';
import { useChartColors } from './chart-theme';

const TF_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export interface PriceLineSpec {
  price: string;
  title: string;
  kind: 'entry' | 'sl' | 'tp' | 'order';
}

interface Props {
  symbol: string;
  tf: string;
  candles: Candle[];
  priceDecimals: number;
  lines: PriceLineSpec[];
  label: string;
  className?: string;
  /** false = static history only (e.g. backtesting replay); no live candles. */
  live?: boolean;
}

interface Bar {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Candlestick chart; history from REST, live 1m candles from the WebSocket aggregated into the timeframe. */
export function PriceChart({
  symbol,
  tf,
  candles,
  priceDecimals,
  lines,
  label,
  className,
  live = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const last = useRef<Bar | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const colors = useChartColors();

  useEffect(() => {
    if (!ref.current) return;
    const c = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.muted,
        attributionLogo: false,
        fontFamily: 'Inter Variable, Inter, sans-serif',
      },
      grid: {
        vertLines: { color: colors.grid, style: 2 },
        horzLines: { color: colors.grid, style: 2 },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: (v: number) => v.toFixed(priceDecimals) },
    });
    series.current = c.addSeries(CandlestickSeries, {
      upColor: colors.profit,
      downColor: colors.loss,
      borderVisible: false,
      wickUpColor: colors.profit,
      wickDownColor: colors.loss,
      priceFormat: { type: 'price', precision: priceDecimals, minMove: 1 / 10 ** priceDecimals },
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      priceLines.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceDecimals]);

  useEffect(() => {
    chart.current?.applyOptions({
      layout: { textColor: colors.muted },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    });
    series.current?.applyOptions({
      upColor: colors.profit,
      downColor: colors.loss,
      wickUpColor: colors.profit,
      wickDownColor: colors.loss,
    });
  }, [colors]);

  // History.
  useEffect(() => {
    const data: Bar[] = candles.map((k) => ({
      time: Math.floor(k.t / 1000) as UTCTimestamp,
      open: Number(k.o),
      high: Number(k.h),
      low: Number(k.l),
      close: Number(k.c),
    }));
    series.current?.setData(data);
    last.current = data.at(-1) ?? null;
    chart.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // Live updates.
  useEffect(() => {
    if (!live) return;
    const step = TF_MS[tf] ?? 60_000;
    return realtime.onCandle((k) => {
      if (k.s !== symbol || k.tf !== '1m' || !series.current) return;
      const bucket = Math.floor((Math.floor(k.t / step) * step) / 1000) as UTCTimestamp;
      const prev = last.current;
      const o = Number(k.o),
        h = Number(k.h),
        l = Number(k.l),
        c = Number(k.c);
      let bar: Bar;
      if (prev && prev.time === bucket) {
        bar = { ...prev, high: Math.max(prev.high, h), low: Math.min(prev.low, l), close: c };
      } else if (!prev || bucket > prev.time) {
        bar = { time: bucket, open: o, high: h, low: l, close: c };
      } else {
        return; // out-of-order update for an older bar
      }
      last.current = bar;
      series.current.update(bar);
    });
  }, [symbol, tf, live]);

  // Position / order price lines.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    for (const pl of priceLines.current) s.removePriceLine(pl);
    const color = { entry: colors.primary, sl: colors.loss, tp: colors.profit, order: colors.aqua };
    priceLines.current = lines.map((l) =>
      s.createPriceLine({
        price: Number(l.price),
        color: color[l.kind],
        lineWidth: 1,
        lineStyle: l.kind === 'entry' ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.title,
      }),
    );
  }, [lines, colors]);

  return <div ref={ref} role="img" aria-label={label} className={className} />;
}
