import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import { useOffers } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';

/** My Offers: personal discount codes (from Daily Points), usable once at checkout. */
export function OffersPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const offers = useOffers();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.offers')} subtitle={t('offers.subtitle')} />
      <Panel title={t('offers.codes')}>
        {offers.isPending ? (
          <Skeleton className="m-5 h-32" />
        ) : offers.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void offers.refetch()}
          />
        ) : offers.data.items.length === 0 ? (
          <EmptyState
            title={t('offers.empty')}
            body={t('offers.emptyBody')}
            action={
              <Button size="sm" asChild>
                <Link to={`/${lang}/app/points`}>{t('app.nav.points')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border" data-testid="offers-list">
            {offers.data.items.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-semibold tracking-wide">
                      {o.code}
                    </span>
                    <Badge
                      variant={
                        o.status === 'AVAILABLE'
                          ? 'success'
                          : o.status === 'USED'
                            ? 'neutral'
                            : 'danger'
                      }
                    >
                      {t(`offers.status.${o.status}`)}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {t('offers.line', {
                      discount: f.bps(o.discountBps),
                      date: date(o.usedAt ?? o.expiresAt),
                      context: o.status === 'USED' ? 'used' : 'valid',
                    })}
                  </p>
                </div>
                {o.status === 'AVAILABLE' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={t('offers.copy', { code: o.code })}
                      onClick={() => {
                        void navigator.clipboard?.writeText(o.code);
                        toast({ kind: 'success', title: t('offers.copied') });
                      }}
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                    <Button size="sm" asChild>
                      <Link to={`/${lang}/app/new-account?offer=${encodeURIComponent(o.code)}`}>
                        {t('offers.use')}
                      </Link>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
