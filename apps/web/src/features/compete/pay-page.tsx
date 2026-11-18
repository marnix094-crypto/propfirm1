import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { useEntry, useCurrentRound, useTestPayment } from './hooks';
import { useCompeteError } from './auth-pages';

/** Test payment page of the fake provider (no real money, D101). */
export function CompetePayPage() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const { lang, entryId } = useParams();
  const navigate = useNavigate();
  const entry = useEntry(entryId, false);
  const round = useCurrentRound();
  const pay = useTestPayment();
  const toMessage = useCompeteError();
  const [error, setError] = useState<string | null>(null);

  const submit = async (outcome: 'succeeded' | 'failed') => {
    setError(null);
    try {
      await pay.mutateAsync({ entryId: entryId!, outcome });
      navigate(`/${lang}/compete/app`, { replace: true });
    } catch (e) {
      setError(toMessage(e));
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('pay.title')}</h1>
      <p className="mt-2 text-muted">{t('pay.sub')}</p>
      <Card className="mt-8" padding="lg">
        {entry.isPending || round.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : entry.isError ? (
          <ErrorState
            title={t('errors.load')}
            retryLabel={t('retry')}
            onRetry={() => void entry.refetch()}
          />
        ) : (
          <>
            <p className="flex items-center gap-2 rounded-[12px] border border-dashed border-border-strong p-3 text-sm">
              <FlaskConical className="size-4 shrink-0 text-accent" aria-hidden="true" />
              {t('pay.testNotice')}
            </p>
            <dl className="mt-6 flex items-baseline justify-between">
              <dt className="text-muted">{t('pay.amount')}</dt>
              <dd className="font-display text-3xl font-bold tabular-nums">
                {round.data ? f.money(round.data.entryFeeMinor, round.data.currency) : '—'}
              </dd>
            </dl>
            {entry.data.status !== 'PENDING_PAYMENT' ? (
              <p className="mt-6 text-sm text-muted">{t(`entryStatus.${entry.data.status}`)}</p>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                <Button onClick={() => void submit('succeeded')} disabled={pay.isPending} fullWidth>
                  {t('pay.succeed')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void submit('failed')}
                  disabled={pay.isPending}
                  fullWidth
                >
                  {t('pay.fail')}
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-loss">
                {error}
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
