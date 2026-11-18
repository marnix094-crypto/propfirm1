import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { useAckAlert, useAdminAlerts, type AdminAlert } from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { dateTime, LoadMore, StatusBadge } from './ui';

/** One-line explanation built from the alert's ids/amounts (no PII in alert details). */
function AlertDetail({ a }: { a: AdminAlert }) {
  const { t } = useTranslation();
  const f = useFormat();
  const d = a.details as Record<string, string | undefined>;
  if (a.type === 'LARGE_LOSS' && d.realizedPnlMinor)
    return (
      <>
        {t('admin.alerts.detail.LARGE_LOSS', {
          amount: f.money(d.realizedPnlMinor, 'USD'),
          symbol: d.symbol ?? '',
        })}
      </>
    );
  if (a.type === 'NEAR_BREACH' && d.usedMinor && d.limitMinor)
    return (
      <>
        {t('admin.alerts.detail.NEAR_BREACH', {
          rule: t(`admin.failReason.${d.rule ?? ''}`, { defaultValue: d.rule ?? '' }),
          used: f.money(d.usedMinor, 'USD'),
          limit: f.money(d.limitMinor, 'USD'),
        })}
      </>
    );
  if (a.type === 'BREACH')
    return (
      <>
        {t('admin.alerts.detail.BREACH', {
          rule: t(`admin.failReason.${d.rule ?? ''}`, { defaultValue: d.rule ?? '' }),
        })}
      </>
    );
  return null;
}

export function AdminAlertsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const [state, setState] = useState<'open' | 'all'>('open');
  const list = useAdminAlerts(state);
  const ack = useAckAlert();
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('admin.nav.alerts')}
        subtitle={t('admin.alerts.subtitle')}
        actions={
          <Tabs
            label={t('admin.alerts.filter')}
            value={state}
            onValueChange={(v) => setState(v as 'open' | 'all')}
            items={[
              { value: 'open', label: t('admin.alerts.open') },
              { value: 'all', label: t('admin.alerts.all') },
            ]}
          />
        }
      />
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
          <EmptyState title={t('admin.alerts.emptyTitle')} body={t('admin.alerts.emptyBody')} />
        ) : (
          <>
            <ul className="divide-y divide-border" data-testid="alert-list">
              {rows.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={a.severity} />
                      <p className="font-semibold">{t(`admin.alerts.type.${a.type}`)}</p>
                    </div>
                    <p className="mt-1 text-sm">
                      <AlertDetail a={a} />
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      <Link to={`/${lang}/admin/traders/${a.userId}`} className="hover:underline">
                        {a.userEmail}
                      </Link>{' '}
                      · {a.accountLabel} · {dateTime(a.createdAt, f.locale)}
                    </p>
                  </div>
                  {a.ackAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Check className="size-3.5" aria-hidden="true" /> {t('admin.alerts.acked')}
                    </span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={ack.isPending}
                      onClick={() =>
                        ack.mutate(a.id, {
                          onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
                        })
                      }
                    >
                      {t('admin.alerts.ack')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
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
