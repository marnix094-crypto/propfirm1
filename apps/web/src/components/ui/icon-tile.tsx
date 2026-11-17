import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface IconTileProps {
  icon: LucideIcon;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'size-9 [&_svg]:size-4',
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-14 [&_svg]:size-6',
};

/** Outline icon inside a rounded square with a soft blue tint. Decorative by default. */
export function IconTile({ icon: Icon, size = 'md', className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-tile border border-border-strong/70 text-accent',
        'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary-tint)_70%,transparent),color-mix(in_srgb,var(--glow-lavender)_18%,transparent))]',
        sizes[size],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
