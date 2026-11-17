import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { MeterState } from '@brand/engine';
import { cn } from '@/lib/cn';

const stroke: Record<MeterState, string> = {
  safe: 'var(--meter-safe)',
  warn: 'var(--meter-warn)',
  breach: 'var(--meter-breach)',
};

interface RadialMeterProps {
  /** 0–100 */
  value: number;
  state: MeterState;
  label: string;
  valueText: string;
  children?: ReactNode;
  size?: number;
  className?: string;
}

/** Account health gauge (270° arc). */
export function RadialMeter({
  value,
  state,
  label,
  valueText,
  children,
  size = 168,
  className,
}: RadialMeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const arc = 0.75; // 270°
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={valueText}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-[225deg]" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--meter-track)"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${arc} 1`}
        />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={stroke[state]}
          strokeWidth="8"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: (clamped / 100) * arc }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
