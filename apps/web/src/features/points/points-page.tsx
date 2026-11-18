import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { StatTile } from '@/components/ui/stat';
import { toast } from '@/components/ui/toaster';
import { usePoints, useRedeem } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

/** Daily Points: earned from real activity, redeemed for discount codes (My Offers). */
export function PointsPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const points = usePoints();
  const redeem = useRedeem();
  const n = (v: number) => new Intl.NumberFormat(f.locale).format(v);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(iso));

  if (points.isPending) return <Skeleton className="h-96" />;
  if (points.isError)
    return (
      <ErrorState
        title={t('errors.generic')}
        retryLabel={t('common.retry')}
        onRetry={() => void points.refetch()}
      />
    );
  const p = points.data;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('app.nav.points')}
        subtitle={t('points.subtitle')}
        actions={p.isExample ? <Badge>{t('points.example')}</Badge> : undefined}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('points.balance')} value={n(p.balance)} testId="points-balance" />
        <StatTile label={t('points.earned')} value={n(p.earned)} />
        <StatTile label={t('points.spent')} value={n(p.spent)} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title={t('points.rewards')} bodyClassName="grid gap-3 p-4 sm:grid-cols-3">
          {p.rewards.map((r) => {
            const affordable = p.balance >= r.points;
            return (
              <div
                key={r.id}
                className="flex flex-col rounded-sm border border-border bg-card-muted p-4"
                data-testid={`reward-${r.id}`}
              >
                <p className="text-2xl font-semibold tabular-nums">
                  {t('points.off', { value: f.bps(r.discountBps) })}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t('points.rewardBody', { days: r.validDays })}
                </p>
                <p className="mt-3 text-sm font-medium tabular-nums">
                  {t('points.cost', { points: n(r.points) })}
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  variant={affordable ? 'primary' : 'secondary'}
                  disabled={!affordable || redeem.isPending}
                  onClick={() =>
                    redeem.mutate(r.id as never, {
                      onSuccess: (o) =>
                        toast({ kind: 'success', title: t('points.redeemed', { code: o.code }) }),
                      onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
                    })
                  }
                >
                  {affordable
                    ? t('points.redeem')
                    : t('points.missing', { points: n(r.points - p.balance) })}
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-muted sm:col-span-3">
            {t('points.offersHint')}{' '}
            <Link to={`/${lang}/app/offers`} className="font-semibold text-link hover:underline">
              {t('app.nav.offers')}
            </Link>
          </p>
        </Panel>

        <Panel title={t('points.howToEarn')}>
          <ul className="divide-y divide-border text-sm">
            {p.earnRules.map((r) => (
              <li key={r.reason} className="flex items-center justify-between gap-3 px-5 py-3">
                <span>{t(`points.reason.${r.reason}`)}</span>
                <span className="font-semibold text-profit tabular-nums">+{n(r.points)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title={t('points.history')}>
        {p.history.length === 0 ? (
          <EmptyState title={t('points.noHistory')} body={t('points.noHistoryBody')} />
        ) : (
          <ul className="divide-y divide-border text-sm" data-testid="points-history">
            {p.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block truncate">{t(`points.reason.${h.reason}`)}</span>
                  <span className="text-xs text-muted">{date(h.createdAt)}</span>
                </span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    h.amount > 0 ? 'text-profit' : 'text-loss',
                  )}
                >
                  {h.amount > 0 ? '+' : ''}
                  {n(h.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
