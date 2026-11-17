import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityPoint } from '@/lib/api-client';
import { useChartColors } from './chart-theme';

interface Props {
  points: EquityPoint[];
  label: string;
  formatValue: (minor: bigint) => string;
  className?: string;
}

/** Equity curve (display only: minor units → number for drawing; values shown via exact formatter). */
export function EquityChart({ points, label, formatValue, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Area'> | null>(null);
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
      grid: { vertLines: { visible: false }, horzLines: { color: colors.grid, style: 2 } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: {
        horzLine: { labelBackgroundColor: colors.primary },
        vertLine: { labelBackgroundColor: colors.primary },
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (v: number) => formatValue(BigInt(Math.round(v))) },
    });
    series.current = c.addSeries(AreaSeries, {
      lineColor: colors.primary,
      topColor: `color-mix(in srgb, ${colors.primary} 28%, transparent)`,
      bottomColor: 'transparent',
      lineWidth: 2,
      priceLineVisible: false,
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.applyOptions({
      layout: { textColor: colors.muted },
      grid: { horzLines: { color: colors.grid } },
      localization: { priceFormatter: (v: number) => formatValue(BigInt(Math.round(v))) },
    });
    series.current?.applyOptions({
      lineColor: colors.primary,
      topColor: `color-mix(in srgb, ${colors.primary} 28%, transparent)`,
    });
  }, [colors, formatValue]);

  useEffect(() => {
    const seen = new Set<number>();
    const data = points
      .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: Number(p.equityMinor) }))
      .filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true)))
      .sort((a, b) => a.time - b.time);
    series.current?.setData(data);
    chart.current?.timeScale().fitContent();
  }, [points]);

  return <div ref={ref} role="img" aria-label={label} className={className} />;
}
