import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export function useAdminError() {
  const { t } = useTranslation('competeAdmin');
  return (err: unknown) =>
    err instanceof ApiError
      ? t(`errors.${err.code}`, { defaultValue: t('errors.generic') })
      : t('errors.generic');
}

export function PageTitle({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card padding="md">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-lg font-bold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Scrollable, keyboard-focusable table. */
export function Table({
  label,
  head,
  children,
  minWidth = 640,
}: {
  label: string;
  head: ReactNode;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="text-left text-xs text-muted">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th
    scope="col"
    className={cn('px-5 py-2.5 font-medium whitespace-nowrap', right && 'text-right')}
  >
    {children}
  </th>
);
export const Td = ({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) => (
  <td
    className={cn(
      'px-5 py-3 align-middle',
      right && 'text-right whitespace-nowrap tabular-nums',
      className,
    )}
  >
    {children}
  </td>
);
export const Tr = ({ children }: { children: ReactNode }) => (
  <tr className="border-t border-border">{children}</tr>
);

const VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'primary'> = {
  ACTIVE: 'success',
  LIVE: 'success',
  SETTLED: 'primary',
  OPEN: 'warning',
  AWAITING_PAYOUT: 'warning',
  SUCCEEDED: 'success',
  CANCELLED: 'neutral',
  SUSPENDED: 'danger',
  SELF_EXCLUDED: 'neutral',
  BREACHED: 'danger',
  FINISHED: 'primary',
  REFUNDED: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('competeAdmin');
  return (
    <Badge variant={VARIANT[status] ?? 'neutral'}>
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
