import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  /** bottom: mobile-style sheet (default); right: side panel on large screens. */
  side?: 'bottom' | 'right';
  className?: string;
}

/** Bottom sheet on mobile; becomes a centered dialog from `sm` up (or a right panel). */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  closeLabel,
  children,
  side = 'bottom',
  className,
}: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay fixed inset-0 z-50 bg-[rgb(7_17_31/0.45)] backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'sheet-content fixed z-50 flex max-h-[92dvh] flex-col border border-border bg-card shadow-float',
            side === 'bottom'
              ? 'inset-x-0 bottom-0 rounded-t-[28px] pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:pb-0'
              : 'inset-y-0 right-0 w-full max-w-md rounded-l-card',
            className,
          )}
        >
          <div
            className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-border sm:hidden"
            aria-hidden="true"
          />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-primary-tint/40 hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;
