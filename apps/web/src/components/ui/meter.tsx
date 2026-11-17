import { motion } from 'motion/react';
import { AlertTriangle, ShieldCheck, XOctagon } from 'lucide-react';
import { meterRatioBps, meterState, type MeterState } from '@brand/engine';
import { cn } from '@/lib/cn';

const fill: Record<MeterState, string> = {
  safe: 'var(--meter-safe)',
  warn: 'var(--meter-warn)',
  breach: 'var(--meter-breach)',
};
const textClass: Record<MeterState, string> = {
  safe: 'text-accent',
  warn: 'text-warn',
  breach: 'text-loss',
};
const icons = { safe: ShieldCheck, warn: AlertTriangle, breach: XOctagon };

export interface MeterProps {
  label: string;
  /** Amount used of the limit, bigint minor units. */
  used: bigint;
  limit: bigint;
  usedLabel: string;
  limitLabel: string;
  /** Localised state names, e.g. { safe: 'Safe', warn: 'Near limit', breach: 'Breached' }. */
  stateLabels: Record<MeterState, string>;
  warnRatioBps?: number;
  className?: string;
}

/**
 * Rule meter: blue = safe, yellow = near limit, red = breached.
 * State is conveyed by colour AND icon + text (not colour alone).
 */
export function Meter({
  label,
  used,
  limit,
  usedLabel,
  limitLabel,
  stateLabels,
  warnRatioBps,
  className,
}: MeterProps) {
  const state = meterState(used, limit, warnRatioBps);
  const ratio = meterRatioBps(used, limit) / 10_000;
  const Icon = icons[state];
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={cn('inline-flex items-center gap-1 text-xs font-semibold', textClass[state])}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {stateLabels[state]}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuetext={`${usedLabel} / ${limitLabel} — ${stateLabels[state]}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--meter-track)]"
      >
        <motion.div
          className="h-full w-full origin-left rounded-full"
          style={{ backgroundColor: fill[state] }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: ratio }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{usedLabel}</span>
        <span>{limitLabel}</span>
      </div>
    </div>
  );
}
