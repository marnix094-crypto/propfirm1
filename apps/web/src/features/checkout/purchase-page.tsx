import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleX, Hourglass } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { SectionLink } from '@/components/layout/section-link';
import { usePurchase } from '@/hooks/use-checkout';
import { useAccounts } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { useTradingUi } from '@/stores/trading';
import { TestPaymentBadge } from './summary';

/** Result of a checkout: waits for the payment, then links to the new funded account(s). */
export function PurchasePage() {
  const { t } = useTranslation();
  const { lang, purchaseId } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const reduce = useReducedMotion();
  const purchase = usePurchase(purchaseId);
  const accounts = useAccounts();
  const setActive = useTradingUi((s) => s.setActiveAccount);

  if (purchase.isPending) return <Skeleton className="mx-auto h-80 max-w-xl rounded-card" />;
  if (purchase.isError)
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
  const created = (accounts.data ?? []).filter((a) => p.accountIds.includes(a.id));
  const open = (id: string) => {
    setActive(id);
    void navigate(`/${lang}/app/portfolio`);
  };

  const icon =
    p.status === 'FULFILLED' || p.status === 'PAID' ? (
      <CircleCheck className="size-12 text-profit" aria-hidden="true" />
    ) : p.status === 'PENDING' ? (
      <Hourglass className="size-12 text-accent" aria-hidden="true" />
    ) : (
      <CircleX className="size-12 text-loss" aria-hidden="true" />
    );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <title>{t(`checkout.status.${p.status}.title`)}</title>
      <Card
        padding="lg"
        className="flex flex-col items-center gap-3 text-center"
        aria-live="polite"
      >
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          {icon}
        </motion.div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="purchase-status">
          {t(`checkout.status.${p.status}.title`)}
        </h1>
        <p className="max-w-md text-sm text-muted">
          {t(`checkout.status.${p.status}.body`, { count: p.quantity })}
        </p>
        <p className="text-sm tabular-nums">
          {p.quantity}× {f.moneyWhole(p.accountSizeMinor, 'USD')} ·{' '}
          <span className="font-semibold">{f.money(p.totalMinor, p.currency)}</span>
        </p>
        {p.isTestPayment && <TestPaymentBadge />}
      </Card>

      {p.status === 'FULFILLED' && (
        <Card padding="none" className="divide-y divide-border overflow-hidden">
          {(created.length ? created : p.accountIds.map((id) => ({ id, label: id }))).map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="font-semibold">{a.label}</span>
              <Button size="sm" onClick={() => open(a.id)}>
                {t('checkout.openAccount')}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {p.status === 'PENDING' && p.paymentUrl && (
        <Button asChild size="lg">
          {p.isTestPayment ? (
            <Link to={`/${lang}/app/checkout/${p.id}/pay`}>{t('checkout.continuePayment')}</Link>
          ) : (
            <a href={p.paymentUrl}>{t('checkout.continuePayment')}</a>
          )}
        </Button>
      )}

      {(p.status === 'FAILED' || p.status === 'CANCELLED') && (
        <Button asChild size="lg" variant="secondary">
          <SectionLink id="pricing">{t('checkout.tryAgain')}</SectionLink>
        </Button>
      )}
    </div>
  );
}
