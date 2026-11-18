import { Navigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { usePurchase, useTestPayment } from '@/hooks/use-checkout';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { PurchaseSummary } from './summary';

/**
 * Payment page of the TEST payment provider. No real money moves: the buttons tell the API
 * which outcome to simulate. Never reachable in production (the API refuses the fake provider).
 */
export function TestPaymentPage() {
  const { t } = useTranslation();
  const { lang, purchaseId } = useParams();
  const f = useFormat();
  const purchase = usePurchase(purchaseId);
  const pay = useTestPayment(purchaseId!);

  if (purchase.isPending) return <Skeleton className="mx-auto h-96 max-w-xl rounded-card" />;
  if (purchase.isError || !purchase.data.isTestPayment)
    return (
      <Card padding="none" className="mx-auto max-w-xl">
        <ErrorState
          title={t('checkout.notFound')}
          retryLabel={t('common.retry')}
          onRetry={() => void purchase.refetch()}
        />
      </Card>
    );
  const p = purchase.data;
  // Paid, failed or cancelled: show the result page.
  if (p.status !== 'PENDING') return <Navigate to={`/${lang}/app/checkout/${p.id}`} replace />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <title>{t('checkout.testPage.title')}</title>
      <div
        role="note"
        className="flex gap-3 rounded-card border border-dashed border-[var(--meter-warn)] bg-[color-mix(in_srgb,var(--meter-warn)_12%,transparent)] p-5"
      >
        <FlaskConical className="size-6 shrink-0 text-[var(--badge-warn-fg)]" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold">{t('checkout.testPage.title')}</h1>
          <p className="mt-1 text-sm">{t('checkout.testPage.body')}</p>
        </div>
      </div>
      <Card padding="lg">
        <PurchaseSummary sizeMinor={p.accountSizeMinor} rules={p.rules} />
        <p className="mt-5 flex items-baseline justify-between text-sm">
          <span className="text-muted">
            {t('checkout.total')} ({p.quantity}×)
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {f.money(p.totalMinor, p.currency)}
          </span>
        </p>
      </Card>
      {pay.isError && (
        <p role="alert" className="text-sm font-medium text-[var(--badge-danger-fg)]">
          {errorMessage(t, pay.error)}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          fullWidth
          disabled={pay.isPending}
          onClick={() => pay.mutate('succeeded')}
        >
          {pay.isPending && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
          {t('checkout.testPage.succeed')}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={pay.isPending} onClick={() => pay.mutate('failed')}>
            {t('checkout.testPage.fail')}
          </Button>
          <Button variant="ghost" disabled={pay.isPending} onClick={() => pay.mutate('cancelled')}>
            {t('checkout.testPage.cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
