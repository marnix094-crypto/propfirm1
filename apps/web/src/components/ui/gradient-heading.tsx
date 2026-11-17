import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Level = 'h1' | 'h2' | 'h3';
const sizes: Record<Level, string> = {
  h1: 'text-4xl sm:text-5xl lg:text-6xl leading-[1.05]',
  h2: 'text-3xl sm:text-4xl lg:text-[2.75rem] leading-[1.1]',
  h3: 'text-2xl sm:text-3xl leading-tight',
};

interface GradientHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: Level;
  /** Visual size; defaults to the semantic level. Keeps one <h1> per page. */
  size?: Level;
}

/** Large heading with the navy → sky text gradient. */
export function GradientHeading({
  as: Tag = 'h2',
  size,
  className,
  ...props
}: GradientHeadingProps) {
  return (
    <Tag
      className={cn(
        'text-gradient font-bold tracking-[-0.025em] text-balance',
        sizes[size ?? Tag],
        className,
      )}
      {...props}
    />
  );
}
