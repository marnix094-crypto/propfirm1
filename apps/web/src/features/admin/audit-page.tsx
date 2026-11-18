import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useAdminAudit, useAdminMe, useVerifyAudit } from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { AdminTable, dateTime, LoadMore, Td, Th, Tr } from './ui';

const FILTERS = ['', 'admin.', 'order.', 'account.', 'rule.', 'user.', 'purchase.'];

export function AdminAuditPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAdminMe().data;
  const [action, setAction] = useState('');
  const list = useAdminAudit(action);
  const verify = useVerifyAudit();
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const canVerify = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('admin.nav.audit')}
        subtitle={t('admin.audit.subtitle')}
        actions={
          canVerify && (
            <Button variant="secondary" disabled={verify.isPending} onClick={() => verify.mutate()}>
              <ShieldCheck aria-hidden="true" /> {t('admin.audit.verify')}
            </Button>
          )
        }
      />
      {verify.data && (
        <p
          role="status"
          className={
            verify.data.ok
              ? 'rounded-[14px] border border-border bg-card px-4 py-3 text-sm font-medium text-profit'
              : 'rounded-[14px] border border-loss/40 bg-card px-4 py-3 text-sm font-medium text-loss'
          }
        >
          {verify.data.ok
            ? t('admin.audit.intact', { count: verify.data.checked })
            : t('admin.audit.broken', { id: verify.data.brokenAtId })}
        </p>
      )}
      <Card padding="none" className="flex flex-wrap items-end gap-3 p-4">
        <Select
          className="w-56"
          label={t('admin.audit.filter')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          {FILTERS.map((a) => (
            <option key={a} value={a}>
              {a ? t(`admin.audit.groups.${a.slice(0, -1)}`) : t('admin.all')}
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
          <EmptyState title={t('admin.audit.emptyTitle')} body={t('admin.audit.emptyBody')} />
        ) : (
          <>
            <AdminTable
              label={t('admin.nav.audit')}
              minWidth={900}
              head={
                <>
                  <Th>{t('admin.audit.time')}</Th>
                  <Th>{t('admin.audit.action')}</Th>
                  <Th>{t('admin.audit.actor')}</Th>
                  <Th>{t('admin.audit.entity')}</Th>
                  <Th>{t('admin.audit.data')}</Th>
                  <Th>{t('admin.audit.hash')}</Th>
                </>
              }
            >
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap">{dateTime(r.ts, f.locale)}</Td>
                  <Td className="font-mono text-xs font-semibold">{r.action}</Td>
                  <Td className="text-xs">
                    {t(`admin.audit.actors.${r.actorType}`)}
                    {r.actorId && <span className="text-muted"> · {r.actorId.slice(-6)}</span>}
                  </Td>
                  <Td className="text-xs">
                    {r.entityType} <span className="text-muted">· {r.entityId.slice(-6)}</span>
                  </Td>
                  <Td className="max-w-72 truncate font-mono text-[11px] text-muted">
                    {JSON.stringify(r.data)}
                  </Td>
                  <Td className="font-mono text-[11px] text-muted">{r.hash.slice(0, 10)}…</Td>
                </Tr>
              ))}
            </AdminTable>
            <LoadMore
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            />
          </>
        )}
      </Card>
      <p className="text-xs text-muted">{t('admin.audit.note')}</p>
    </div>
  );
}
