import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Panel, PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useAdminAlerts, useAdminOverview, type AdminOverview } from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { Kpi, StatusBadge } from './ui';

/** 30 bars of daily paid sales. Exact values are in the visually hidden table below it. */
function SalesChart({ days }: { days: AdminOverview['salesByDay'] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const max = days.reduce((m, d) => (BigInt(d.salesMinor) > m ? BigInt(d.salesMinor) : m), 0n);
  const short = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { day: 'numeric', month: 'short' }).format(
      new Date(`${iso}T12:00:00Z`),
    );
  return (
    <figure className="relative">
      {max === 0n && (
        <p className="absolute inset-x-0 top-14 text-center text-sm text-muted">
          {t('admin.overview.noSales')}
        </p>
      )}
      <div className="flex h-44 items-end gap-[3px]" aria-hidden="true">
        {days.map((d) => {
          const v = BigInt(d.salesMinor);
          const h = max > 0n ? Math.max(2, Number((v * 100n) / max)) : 2;
          return (
            <div
              key={d.date}
              title={`${short(d.date)} · ${f.money(d.salesMinor, 'EUR')}`}
              className="flex-1 rounded-t-[4px] bg-[var(--brand-lime)] data-[empty=true]:bg-[var(--meter-track)]"
              data-empty={v === 0n}
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{days[0] && short(days[0].date)}</span>
        <span>{days.at(-1) && short(days.at(-1)!.date)}</span>
      </div>
      <figcaption className="sr-only">{t('admin.overview.chartCaption')}</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th scope="col">{t('admin.overview.date')}</th>
            <th scope="col">{t('admin.overview.sales')}</th>
            <th scope="col">{t('admin.overview.orders')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{short(d.date)}</td>
              <td>{f.money(d.salesMinor, 'EUR')}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const o = useAdminOverview();
  const alerts = useAdminAlerts('open');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.overview')} subtitle={t('admin.overview.subtitle')} />
      {o.isPending ? (
        <div className="grid gap-4 md:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      ) : o.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void o.refetch()}
        />
      ) : (
        <>
          <section
            aria-label={t('admin.overview.kpis')}
            className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6"
            data-testid="admin-kpis"
          >
            <Kpi
              label={t('admin.overview.sales30d')}
              value={f.money(o.data.sales30dMinor, 'EUR')}
              hint={t('admin.overview.ordersCount', { count: o.data.orders30d })}
            />
            <Kpi
              label={t('admin.overview.traders')}
              value={o.data.traders}
              hint={t('admin.overview.newTraders', { count: o.data.newTraders30d })}
            />
            <Kpi
              label={t('admin.overview.fundedActive')}
              value={o.data.fundedActive}
              hint={t('admin.overview.failed30d', { count: o.data.fundedFailed30d })}
            />
            <Kpi
              label={t('admin.overview.openAlerts')}
              value={o.data.openAlerts}
              tone={o.data.criticalAlerts > 0 ? 'danger' : undefined}
              hint={t('admin.overview.critical', { count: o.data.criticalAlerts })}
            />
            <Kpi label={t('admin.overview.demoAccounts')} value={o.data.demoAccounts} />
            <Kpi
              label={t('admin.overview.competitionAccounts')}
              value={o.data.competitionAccounts}
            />
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Card padding="none" className="p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">{t('admin.overview.salesChart')}</h2>
                <p className="text-sm text-muted">
                  {t('admin.overview.allTime')}{' '}
                  <span className="font-semibold text-fg tabular-nums">
                    {f.money(o.data.salesAllTimeMinor, 'EUR')}
                  </span>
                </p>
              </div>
              <SalesChart days={o.data.salesByDay} />
            </Card>
            <Panel
              title={t('admin.overview.latestAlerts')}
              actions={
                <Link
                  to={`/${lang}/admin/alerts`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
                >
                  {t('admin.viewAll')} <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              }
            >
              {alerts.isPending ? (
                <Skeleton className="m-5 h-24" />
              ) : (alerts.data?.pages[0]?.items.length ?? 0) === 0 ? (
                <EmptyState
                  title={t('admin.alerts.emptyTitle')}
                  body={t('admin.alerts.emptyBody')}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {alerts.data!.pages[0]!.items.slice(0, 5).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {t(`admin.alerts.type.${a.type}`)}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {a.userEmail} · {a.accountLabel} · {f.relativeTime(a.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={a.severity} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
