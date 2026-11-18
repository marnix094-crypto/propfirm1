import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

/** Horizontally scrollable, keyboard-focusable table wrapper. */
export function AdminTable({
  label,
  head,
  children,
  minWidth = 720,
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

export const Th = ({ children, right }: { children: ReactNode; right?: boolean }) => (
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
  <tr className="border-t border-border hover:bg-card-muted">{children}</tr>
);

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'primary'> = {
  ACTIVE: 'success',
  FUNDED_ACTIVE: 'success',
  PASSED: 'primary',
  PENDING_FUNDED: 'warning',
  SUSPENDED: 'danger',
  FAILED: 'danger',
  CLOSED: 'neutral',
  PENDING_DELETION: 'warning',
  DELETED: 'neutral',
  PAID: 'success',
  FULFILLED: 'success',
  PENDING: 'warning',
  CANCELLED: 'neutral',
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'neutral'}>
      {t(`admin.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'danger';
}) {
  return (
    <Card padding="none" className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn(
          'mt-2 text-2xl font-bold tracking-tight tabular-nums',
          tone === 'danger' && 'text-loss',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center p-4">
      <Button variant="secondary" size="sm" disabled={loading} onClick={onClick}>
        {t('admin.loadMore')}
      </Button>
    </div>
  );
}

/** Confirmation with a required reason (stored in the audit log). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
      title={title}
      description={description}
      closeLabel={t('common.close')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(reason.trim());
        }}
      >
        <Input
          label={t('admin.reason')}
          hint={t('admin.reasonHint')}
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant={danger ? 'secondary' : 'primary'}
            disabled={!valid || pending}
            className={
              danger
                ? 'border-[var(--loss-text)] bg-[var(--loss-text)] text-white hover:border-[var(--loss-text)] hover:brightness-95'
                : undefined
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Short date + time in the user's locale. */
export const dateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
export const dateOnly = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
