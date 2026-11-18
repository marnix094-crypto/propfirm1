import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2, MailWarning, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { SectionLink } from '@/components/layout/section-link';
import { useProduct, useQuote } from '@/hooks/use-catalog';
import { useOffers } from '@/hooks/use-features';
import { applyBps } from '@brand/engine';
import { Input } from '@/components/ui/field';
import { newCheckoutKey, useCreateCheckout } from '@/hooks/use-checkout';
import { useFormat } from '@/hooks/use-format';
import { call, client } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { useSession } from '@/stores/session';
import { toast } from '@/components/ui/toaster';
import { PurchaseSummary } from './summary';

const MAX_QTY = 5;

export function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const [params] = useSearchParams();
  const productId = params.get('product');
  const quoteId = productId ? null : params.get('quote');
  const initialQty = Math.min(MAX_QTY, Math.max(1, Number(params.get('qty')) || 1));
  const [qty, setQty] = useState(initialQty);
  const [accepted, setAccepted] = useState(false);
  const [offerCode, setOfferCode] = useState(params.get('offer') ?? '');
  const offers = useOffers();
  // One key per checkout attempt: double clicks and retries never create two purchases.
  const [key, setKey] = useState(newCheckoutKey);
  const user = useSession((s) => s.user);
  const product = useProduct(productId);
  const quote = useQuote(quoteId);
  const create = useCreateCheckout();

  const item = useMemo(() => {
    if (product.data)
      return {
        sizeMinor: product.data.accountSizeMinor,
        priceMinor: product.data.priceMinor,
        rules: product.data.rules,
      };
    if (quote.data)
      return {
        sizeMinor: quote.data.accountSizeMinor,
        priceMinor: quote.data.priceMinor,
        rules: quote.data.rules,
      };
    return null;
  }, [product.data, quote.data]);
  const subtotal = item ? BigInt(item.priceMinor) * BigInt(qty) : 0n;
  const matchedOffer = (offers.data?.items ?? []).find(
    (o) => o.status === 'AVAILABLE' && o.code === offerCode.trim().toUpperCase(),
  );
  const discount = matchedOffer ? applyBps(subtotal, matchedOffer.discountBps) : 0n;
  const loading = (productId && product.isPending) || (quoteId && quote.isPending);
  const failed = product.isError || quote.isError || (!productId && !quoteId);

  async function pay() {
    try {
      const p = await create.mutateAsync({
        key,
        body: {
          ...(productId ? { productId } : { quoteId: quoteId! }),
          ...(offerCode.trim() ? { offerCode: offerCode.trim().toUpperCase() } : {}),
          quantity: qty,
          acceptTerms: true,
          locale: (['en', 'nl', 'es'] as const).find((l) => l === i18n.language) ?? 'en',
        },
      });
      if (p.isTestPayment) void navigate(`/${lang}/app/checkout/${p.id}/pay`);
      else if (p.paymentUrl) window.location.assign(p.paymentUrl);
    } catch {
      setKey(newCheckoutKey()); // a refused attempt may be retried with a fresh key
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <title>{t('checkout.title')}</title>
      <h1 className="text-2xl font-bold tracking-tight">{t('checkout.title')}</h1>

      {loading && <Skeleton className="h-96 rounded-card" />}
      {!loading && (failed || !item) && (
        <Card padding="none">
          <ErrorState
            title={t('checkout.notFound')}
            retryLabel={t('checkout.backToPricing')}
            onRetry={() => void navigate(`/${lang}/app/new-account`)}
          />
        </Card>
      )}

      {!loading && item && (
        <>
          <Card padding="lg" data-testid="checkout-summary">
            <PurchaseSummary sizeMinor={item.sizeMinor} rules={item.rules} />
            <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
              <Stepper
                value={qty}
                onChange={setQty}
                min={1}
                max={MAX_QTY}
                label={t('checkout.quantity')}
                decrementLabel={t('landing.pricing.decrement')}
                incrementLabel={t('landing.pricing.increment')}
              />
              <div className="text-right">
                <p className="text-sm text-muted">{t('checkout.total')}</p>
                {discount > 0n && (
                  <p className="text-sm text-muted tabular-nums line-through">
                    {f.money(subtotal, 'EUR')}
                  </p>
                )}
                <p className="text-2xl font-bold tabular-nums" data-testid="checkout-total">
                  {f.money(subtotal - discount, 'EUR')}
                </p>
                <p className="text-xs text-muted">{t('landing.pricing.oneTimeFee')}</p>
              </div>
            </div>
          </Card>

          <Card padding="lg" className="flex flex-col gap-4">
            <Input
              label={t('checkout.offerCode')}
              hint={
                matchedOffer
                  ? t('checkout.offerApplied', { discount: f.bps(matchedOffer.discountBps) })
                  : t('checkout.offerHint')
              }
              value={offerCode}
              autoCapitalize="characters"
              placeholder="DF-XXXXXXXX"
              onChange={(e) => setOfferCode(e.target.value)}
            />
            <p className="flex gap-3 text-sm">
              <ShieldAlert className="size-5 shrink-0 text-accent" aria-hidden="true" />
              <span>{t('checkout.simulatedNotice')}</span>
            </p>

            {user && !user.emailVerified && <VerifyFirst />}

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
              />
              <span>
                {t('checkout.accept')}{' '}
                <span className="text-muted">
                  (
                  <Link to={`/${lang}/legal/terms`} target="_blank" className="text-link underline">
                    {t('auth.register.readTerms')}
                  </Link>
                  ,{' '}
                  <Link to={`/${lang}/legal/risk`} target="_blank" className="text-link underline">
                    {t('auth.register.readRisk')}
                  </Link>
                  ,{' '}
                  <Link
                    to={`/${lang}/legal/refund`}
                    target="_blank"
                    className="text-link underline"
                  >
                    {t('checkout.readRefund')}
                  </Link>
                  )
                </span>
              </span>
            </label>

            {create.isError && (
              <p
                role="alert"
                className="rounded-[14px] bg-[color-mix(in_srgb,var(--loss)_10%,transparent)] px-3.5 py-2.5 text-sm font-medium text-[var(--badge-danger-fg)]"
              >
                {errorMessage(t, create.error)}
              </p>
            )}

            <Button
              size="lg"
              fullWidth
              disabled={!accepted || create.isPending || !user?.emailVerified}
              onClick={() => void pay()}
            >
              {create.isPending && (
                <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
              )}
              {t('checkout.pay')}
            </Button>
            <p className="text-xs leading-relaxed text-muted">{t('landing.pricing.disclaimer')}</p>
          </Card>
          <SectionLink id="pricing" className="self-center text-sm font-semibold text-link">
            {t('checkout.backToPricing')}
          </SectionLink>
        </>
      )}
    </div>
  );
}

function VerifyFirst() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[18px] bg-[color-mix(in_srgb,var(--meter-warn)_14%,transparent)] p-4 text-sm sm:flex-row sm:items-center"
    >
      <MailWarning className="size-5 shrink-0 text-[var(--badge-warn-fg)]" aria-hidden="true" />
      <span className="flex-1">{t('checkout.verifyFirst')}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await call(() => client.POST('/api/v1/auth/verify-email/resend'));
            toast({ kind: 'success', title: t('app.verifyBanner.sent') });
          } catch (e) {
            toast({ kind: 'error', title: errorMessage(t, e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('app.verifyBanner.resend')}
      </Button>
    </div>
  );
}
