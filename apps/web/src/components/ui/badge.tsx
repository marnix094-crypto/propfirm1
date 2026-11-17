import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none whitespace-nowrap [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        neutral: 'border border-border bg-card-muted text-muted',
        primary: 'bg-primary-tint/60 text-accent',
        recommended:
          'bg-[var(--accent-deep)] text-[var(--text-on-accent)] shadow-[0_6px_18px_-6px_rgb(37_99_235/0.6)]',
        success: 'bg-[color-mix(in_srgb,var(--profit)_14%,transparent)] text-profit',
        warning: 'bg-[color-mix(in_srgb,var(--meter-warn)_18%,transparent)] text-warn',
        danger: 'bg-[color-mix(in_srgb,var(--loss)_12%,transparent)] text-loss',
        simulated: 'border border-dashed border-border-strong bg-card text-accent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
