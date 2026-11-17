import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Accordion = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>) => (
  <AccordionPrimitive.Root className={cn('flex flex-col gap-3', className)} {...props} />
);

interface AccordionItemProps {
  value: string;
  question: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ value, question, children, className }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item
      value={value}
      className={cn(
        'rounded-[20px] border border-border bg-card shadow-card transition-colors data-[state=open]:border-border-strong',
        className,
      )}
    >
      <AccordionPrimitive.Header asChild>
        <h3>
          <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 rounded-[20px] px-5 py-4 text-left text-[15px] font-semibold sm:px-6 sm:py-5 sm:text-base">
            {question}
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-tint/50 text-accent transition-transform duration-300 group-data-[state=open]:rotate-180">
              <ChevronDown className="size-4" aria-hidden="true" />
            </span>
          </AccordionPrimitive.Trigger>
        </h3>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="accordion-content overflow-hidden">
        <div className="px-5 pb-5 text-[15px] leading-relaxed text-muted sm:px-6">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}
