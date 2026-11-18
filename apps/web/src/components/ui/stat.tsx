import { cn } from '@/lib/cn';

/** Compact figure tile used on platform pages (label, value, optional sub line). */
export function StatTile({
  label,
  value,
  sub,
  tone,
  className,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'profit' | 'loss';
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('min-w-0 rounded-card border border-border bg-card px-4 py-3.5', className)}>
      <p className="truncate text-xs text-muted">{label}</p>
      <p
        data-testid={testId}
        className={cn(
          'mt-1 truncate text-xl font-semibold tracking-tight tabular-nums',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}
