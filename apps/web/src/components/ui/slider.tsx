import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Values rendered as tick labels under the track. */
  marks?: number[];
  formatValue?: (value: number) => string;
  label: string;
  className?: string;
  disabled?: boolean;
}

export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  marks,
  formatValue = String,
  label,
  className,
  disabled,
}: SliderProps) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-muted">{label}</span>
        <output className="tabular-nums text-lg font-semibold" aria-live="polite">
          {formatValue(value)}
        </output>
      </div>
      <SliderPrimitive.Root
        className="relative flex h-6 w-full touch-none items-center select-none data-[disabled]:opacity-50"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onValueChange(v[0] ?? min)}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[var(--meter-track)]">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-[linear-gradient(90deg,var(--glow-aqua),var(--primary),var(--accent-deep))]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={label}
          aria-valuetext={formatValue(value)}
          className="block size-6 rounded-full border-2 border-primary bg-white shadow-[0_4px_14px_-2px_rgb(14_165_233/0.55)] transition-transform duration-150 hover:scale-110 focus-visible:scale-110"
        />
      </SliderPrimitive.Root>
      {marks && (
        <div className="relative mt-2 h-5 text-xs text-muted tabular-nums" aria-hidden="true">
          {marks.map((m) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              onClick={() => onValueChange(m)}
              className="absolute -translate-x-1/2 hover:text-fg"
              style={{ left: `${pct(m)}%` }}
            >
              {formatValue(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
