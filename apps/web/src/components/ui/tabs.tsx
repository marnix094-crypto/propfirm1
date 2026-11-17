import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: ReactNode }[];
  label: string;
  children?: ReactNode;
  className?: string;
}

/** Segmented tabs with a sliding indicator. */
export function Tabs({ value, onValueChange, items, label, children, className }: TabsProps) {
  const layoutId = useId();
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List
        aria-label={label}
        className="inline-flex gap-1 rounded-btn border border-border bg-card p-1 shadow-card"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              'relative rounded-[10px] px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-fg',
              'data-[state=active]:text-fg',
            )}
          >
            {value === item.value && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[10px] bg-primary-tint/60"
                transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export const TabsContent = TabsPrimitive.Content;
