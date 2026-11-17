import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const control =
  'h-11 w-full rounded-btn border border-border bg-card px-3.5 text-[15px] text-fg placeholder:text-muted/70 transition-colors ' +
  'hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ' +
  'aria-[invalid=true]:border-loss disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: ReactNode;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ label, hint, error, suffix, className, id, ...props }, ref) => {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy =
    [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(control, suffix ? 'pr-16' : '', 'tabular-nums')}
          {...props}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-loss">
          {error}
        </p>
      )}
    </div>
  );
});
Input.displayName = 'Input';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, hint, error, className, id, children, ...props }, ref) => {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={cn(control, 'appearance-none pr-10')}
        {...props}
      >
        {children}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-loss">
          {error}
        </p>
      )}
    </div>
  );
});
Select.displayName = 'Select';
