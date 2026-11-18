import { useTranslation } from 'react-i18next';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { StatTile } from '@/components/ui/stat';
import { usePayoutFeed } from '@/hooks/use-catalog';
import { useTransparency } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';

/** Transparency: public figures computed from real data (no estimates, no examples). */
export function TransparencyPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useTransparency();
  const feed = usePayoutFeed();
  const n = (v: number) => new Intl.NumberFormat(f.locale).format(v);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.transparency')} subtitle={t('transparency.subtitle')} />
      {q.isPending ? (
        <Skeleton className="h-40" />
      ) : q.isError ? (
        <ErrorState
          title={t('errors.generic')}
          retryLabel={t('common.retry')}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="transparency">
            <StatTile label={t('transparency.traders')} value={n(q.data.traders)} />
            <StatTile label={t('transparency.funded')} value={n(q.data.fundedAccounts)} />
            <StatTile label={t('transparency.active')} value={n(q.data.activeFundedAccounts)} />
            <StatTile label={t('transparency.closed')} value={n(q.data.closedFundedAccounts)} />
            <StatTile label={t('transparency.payouts')} value={n(q.data.payouts)} />
            <StatTile
              label={t('transparency.paidOut')}
              value={f.money(q.data.payoutsTotalMinor, 'USD')}
            />
          </div>
          <p className="text-xs text-muted">
            {t('transparency.updated', {
              time: new Intl.DateTimeFormat(f.locale, { timeStyle: 'short' }).format(
                new Date(q.data.updatedAt),
              ),
            })}
          </p>
        </>
      )}
      <Panel title={t('transparency.feed')}>
        {(feed.data?.items.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{t('transparency.noPayouts')}</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {feed.data!.items.map((p) => (
              <li key={p.id} className="flex justify-between px-5 py-3">
                <span>{p.countryCode}</span>
                <span className="font-semibold tabular-nums">
                  {f.money(p.amountMinor, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('transparency.howTitle')} bodyClassName="p-5">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {(t('transparency.how', { returnObjects: true }) as string[]).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
