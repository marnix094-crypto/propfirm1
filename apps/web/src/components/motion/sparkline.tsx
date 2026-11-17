import { motion, useReducedMotion } from 'motion/react';
import { useId, useMemo } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Accessible summary, e.g. "Equity up 4.2% this month". Omit for purely decorative use. */
  label?: string;
}

/** Line that draws itself when it enters the viewport, with a soft area fill. */
export function Sparkline({ data, width = 320, height = 96, className, label }: SparklineProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pad = 6;
    const pts = data.map((d, i) => [
      (i / (data.length - 1)) * width,
      pad + (1 - (d - min) / span) * (height - pad * 2),
    ]);
    const l = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');
    return { line: l, area: `${l} L${width},${height} L0,${height} Z` };
  }, [data, width, height]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-stroke`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--glow-aqua)" />
          <stop offset="0.6" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--accent-deep)" />
        </linearGradient>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#${id}-fill)`}
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.6 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke={`url(#${id}-stroke)`}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
