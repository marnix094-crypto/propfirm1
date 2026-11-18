import type { ReactNode } from 'react';
import { Card } from './card';
import { cn } from '@/lib/cn';

/** Flat platform panel: a card with a compact title bar and optional actions. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  ...rest
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  'data-testid'?: string;
}) {
  return (
    <Card padding="none" className={cn('min-w-0', className)} {...rest}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {actions}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

/** Page heading used on platform pages. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <title>{title}</title>
        {/* The top bar shows the title on desktop; it stays the page's h1 for assistive tech. */}
        <h1 className="font-display text-xl font-semibold tracking-tight lg:sr-only">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
