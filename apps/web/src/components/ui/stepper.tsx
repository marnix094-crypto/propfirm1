import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Quantity stepper. The input is a native spinbutton (arrow keys work). */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 10,
  label,
  decrementLabel,
  incrementLabel,
  className,
}: StepperProps) {
  const id = useId();
  const btn =
    'inline-flex size-10 items-center justify-center rounded-[11px] text-accent transition-colors hover:bg-primary-tint/50 disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="inline-flex items-center gap-1 rounded-btn border border-border bg-card p-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
        <button
          type="button"
          className={btn}
          aria-label={decrementLabel}
          aria-controls={id}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - 1, min, max))}
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onChange(clamp(n, min, max));
          }}
          className="w-10 appearance-none bg-transparent text-center text-base font-semibold tabular-nums [-moz-appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          className={btn}
          aria-label={incrementLabel}
          aria-controls={id}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 1, min, max))}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
