import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-[var(--meter-track)]', className)}
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <span className="text-muted" aria-hidden="true">
        {icon ?? <Inbox className="size-7" />}
      </span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  retryLabel,
  onRetry,
}: {
  title: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center"
    >
      <AlertCircle className="size-7 text-loss" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden="true" /> {retryLabel}
      </Button>
    </div>
  );
}
