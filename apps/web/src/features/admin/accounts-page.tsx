import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useAdminAccounts,
  useAdminMe,
  useFailAccount,
  type AccountKind,
  type AccountStatus,
  type AdminAccount,
} from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { AdminTable, dateOnly, LoadMore, ReasonDialog, StatusBadge, Td, Th, Tr } from './ui';

const KINDS: AccountKind[] = ['DEMO', 'FUNDED', 'COMPETITION', 'CHALLENGE'];
const STATUSES: AccountStatus[] = ['ACTIVE', 'FUNDED_ACTIVE', 'FAILED', 'CLOSED', 'SUSPENDED'];

export function ACCOUNT_HEAD({ hideTrader }: { hideTrader?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <Th>{t('admin.accounts.account')}</Th>
      {!hideTrader && <Th>{t('admin.accounts.trader')}</Th>}
      <Th>{t('admin.accounts.status')}</Th>
      <Th right>{t('admin.accounts.size')}</Th>
      <Th right>{t('admin.accounts.balance')}</Th>
      <Th right>{t('admin.accounts.pnl')}</Th>
      <Th>{t('admin.accounts.rules')}</Th>
      <Th>{t('admin.accounts.opened')}</Th>
      <Th>
        <span className="sr-only">{t('admin.actions')}</span>
      </Th>
    </>
  );
}

export function AccountRows({
  rows,
  hideTrader,
  canFail,
}: {
  rows: AdminAccount[];
  hideTrader?: boolean;
  canFail: boolean;
}) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const fail = useFailAccount();
  const [target, setTarget] = useState<AdminAccount | null>(null);
  return (
    <>
      {rows.map((a) => {
        const pnl = BigInt(a.pnlMinor);
        const active = a.status === 'ACTIVE' || a.status === 'FUNDED_ACTIVE';
        return (
          <Tr key={a.id}>
            <Td className="whitespace-nowrap">
              <p className="font-semibold">{a.label}</p>
              <p className="text-xs text-muted">
                {t(`admin.kind.${a.kind}`)} · {a.id.slice(-6).toUpperCase()}
              </p>
            </Td>
            {!hideTrader && (
              <Td>
                <Link to={`/${lang}/admin/traders/${a.userId}`} className="hover:underline">
                  {a.userEmail}
                </Link>
              </Td>
            )}
            <Td>
              <StatusBadge status={a.status} />
              {a.failReason && (
                <p className="mt-1 text-xs text-muted">
                  {t(`admin.failReason.${a.failReason}`, { defaultValue: a.failReason })}
                </p>
              )}
            </Td>
            <Td right>{f.money(a.initialBalanceMinor, a.currency)}</Td>
            <Td right>{f.money(a.balanceMinor, a.currency)}</Td>
            <Td
              right
              className={cn(
                'font-semibold',
                pnl > 0n ? 'text-profit' : pnl < 0n ? 'text-loss' : '',
              )}
            >
              {f.money(pnl, a.currency, { signDisplay: 'exceptZero' })}
            </Td>
            <Td className="max-w-48 truncate text-muted">
              <span title={a.ruleSetName ?? undefined}>{a.ruleSetName ?? '—'}</span>
            </Td>
            <Td className="whitespace-nowrap">{dateOnly(a.createdAt, f.locale)}</Td>
            <Td right className="whitespace-nowrap">
              {canFail && active && a.kind !== 'DEMO' && (
                <Button variant="secondary" size="sm" onClick={() => setTarget(a)}>
                  {t('admin.accounts.fail')}
                </Button>
              )}
            </Td>
          </Tr>
        );
      })}
      {/* Renders through a portal: adds no DOM inside the table body. */}
      <ReasonDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('admin.accounts.failTitle', { label: target?.label ?? '' })}
        description={t('admin.accounts.failBody')}
        confirmLabel={t('admin.accounts.fail')}
        danger
        pending={fail.isPending}
        onConfirm={(reason) =>
          fail.mutate(
            { id: target!.id, reason },
            {
              onSuccess: () => {
                setTarget(null);
                toast({ kind: 'success', title: t('admin.accounts.failDone') });
              },
              onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
            },
          )
        }
      />
    </>
  );
}

export function AdminAccountsPage() {
  const { t } = useTranslation();
  const me = useAdminMe().data;
  const [kind, setKind] = useState<AccountKind | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const list = useAdminAccounts({ kind: kind || undefined, status: status || undefined });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const canFail = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.accounts')} subtitle={t('admin.accounts.subtitle')} />
      <Card padding="none" className="flex flex-wrap items-end gap-3 p-4">
        <Select
          className="w-48"
          label={t('admin.accounts.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind | '')}
        >
          <option value="">{t('admin.all')}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`admin.kind.${k}`)}
            </option>
          ))}
        </Select>
        <Select
          className="w-48"
          label={t('admin.accounts.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as AccountStatus | '')}
        >
          <option value="">{t('admin.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.status.${s}`)}
            </option>
          ))}
        </Select>
      </Card>
      <Card padding="none">
        {list.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : list.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('admin.accounts.emptyTitle')} body={t('admin.accounts.emptyBody')} />
        ) : (
          <>
            <AdminTable label={t('admin.nav.accounts')} head={<ACCOUNT_HEAD />} minWidth={1080}>
              <AccountRows rows={rows} canFail={canFail} />
            </AdminTable>
            <LoadMore
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            />
          </>
        )}
      </Card>
    </div>
  );
}
