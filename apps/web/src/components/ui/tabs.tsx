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
  /** Optional content rendered next to the tab list (e.g. a title), inside `listWrapperClassName`. */
  header?: ReactNode;
  listWrapperClassName?: string;
}

/** Segmented tabs with a sliding indicator. */
export function Tabs({
  value,
  onValueChange,
  items,
  label,
  children,
  className,
  header,
  listWrapperClassName,
}: TabsProps) {
  const layoutId = useId();
  // Without panels this is a segmented control (radiogroup), not a tablist.
  if (children === undefined) {
    return (
      <div className={className}>
        <div className={listWrapperClassName}>
          {header}
          <div
            role="radiogroup"
            aria-label={label}
            className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
          >
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={value === item.value}
                onClick={() => onValueChange(item.value)}
                className={cn(
                  'relative shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-fg sm:px-4',
                  value === item.value && 'text-fg',
                )}
              >
                {value === item.value && (
                  <motion.span
                    layoutId={layoutId}
                    className="absolute inset-0 rounded-full bg-primary-tint"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <div className={listWrapperClassName}>
        {header}
        <TabsPrimitive.List
          aria-label={label}
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1"
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              className={cn(
                'relative shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:text-fg sm:px-4',
                'data-[state=active]:text-fg',
              )}
            >
              {value === item.value && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full bg-primary-tint"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
              <span className="relative">{item.label}</span>
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      </div>
      {children}
    </TabsPrimitive.Root>
  );
}

export const TabsContent = TabsPrimitive.Content;
