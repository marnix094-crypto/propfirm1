import type { ReactNode } from 'react';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/cn';

interface LandingSectionProps {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function LandingSection({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className,
}: LandingSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('scroll-mt-20 py-16 sm:py-24', className)}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          {eyebrow && (
            <p className="mb-3 text-sm font-semibold tracking-wide text-accent uppercase">
              {eyebrow}
            </p>
          )}
          <GradientHeading id={`${id}-title`}>{title}</GradientHeading>
          {subtitle && <p className="mt-4 text-lg text-muted">{subtitle}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}
