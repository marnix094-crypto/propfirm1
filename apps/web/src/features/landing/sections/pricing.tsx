import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, RotateCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { applyBps } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { useProducts, type Product } from '@/hooks/use-catalog';
import { useFormat } from '@/hooks/use-format';
import { isMockData } from '@/lib/api';
import { cn } from '@/lib/cn';
import { LandingSection } from '../section';
import { CustomAccountModal } from './custom-account-modal';

const GRID = 'flex flex-wrap justify-center gap-5';
const CARD_WIDTH = 'w-full sm:w-[calc(50%-0.625rem)] lg:w-[calc(33.333%-0.84rem)]';

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
      <dt className="text-muted">
        {label}
        {hint && <span className="block text-xs">{hint}</span>}
      </dt>
      <dd className="text-right font-semibold whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}

export function PricingCard({ product }: { product: Product }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const [qty, setQty] = useState(1);
  const size = BigInt(product.accountSizeMinor);
  const price = BigInt(product.priceMinor);
  const r = product.rules;

  return (
    <Card
      interactive
      padding="none"
      data-testid={`pricing-card-${product.slug}`}
      className={cn(
        'relative flex h-full flex-col p-6',
        product.isRecommended &&
          'border-primary shadow-[0_0_0_1px_var(--primary),var(--shadow-card-hover)]',
      )}
    >
      {product.isRecommended && (
        <Badge variant="recommended" className="absolute -top-3 left-6">
          <Sparkles aria-hidden="true" /> {t('landing.pricing.recommended')}
        </Badge>
      )}
      <p className="text-sm text-muted">{t('landing.pricing.capital')}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
        {f.moneyWhole(size, product.accountCurrency)}
      </p>
      <dl className="mt-4 divide-y divide-border border-y border-border">
        <Row
          label={t('landing.pricing.maxDrawdown')}
          hint={t(`landing.pricing.drawdownType.${r.drawdownType}`)}
          value={`${f.bps(r.maxDrawdownBps)} · ${f.moneyWhole(applyBps(size, r.maxDrawdownBps), product.accountCurrency)}`}
        />
        <Row label={t('landing.pricing.dailyLoss')} value={f.bps(r.maxDailyLossBps)} />
        <Row label={t('landing.pricing.profitSplit')} value={f.bps(r.profitSplitBps)} />
        <Row label={t('landing.pricing.leverage')} value={f.leverage(r.maxLeverage)} />
      </dl>
      <div className="mt-5">
        <p className="text-2xl font-bold tabular-nums">{f.money(price, product.priceCurrency)}</p>
        <p className="text-xs text-muted">{t('landing.pricing.oneTimeFee')}</p>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <Stepper
          value={qty}
          onChange={setQty}
          min={1}
          max={5}
          label={t('landing.pricing.quantity', {
            size: f.moneyWhole(size, product.accountCurrency),
          })}
          decrementLabel={t('landing.pricing.decrement')}
          incrementLabel={t('landing.pricing.increment')}
          className="self-start"
        />
        <p className="text-sm text-muted tabular-nums" aria-live="polite">
          {t('landing.pricing.total')}:{' '}
          <span className="font-semibold text-fg">
            {f.money(price * BigInt(qty), product.priceCurrency)}
          </span>
        </p>
      </div>
      <div className="mt-auto pt-5">
        <Button asChild fullWidth variant={product.isRecommended ? 'primary' : 'secondary'}>
          <Link to={`/${lang}/app/checkout?product=${encodeURIComponent(product.id)}&qty=${qty}`}>
            {t('landing.pricing.buy')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function PricingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={GRID} aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn(
            CARD_WIDTH,
            'h-[30rem] animate-pulse rounded-card border border-border bg-card/60',
          )}
        />
      ))}
    </div>
  );
}

export function Pricing() {
  const { t } = useTranslation();
  const products = useProducts('INSTANT');
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <LandingSection
      id="pricing"
      eyebrow={t('landing.pricing.eyebrow')}
      title={t('landing.pricing.title')}
      subtitle={t('landing.pricing.subtitle')}
    >
      {(isMockData() || products.data?.items.some((p) => p.isExample)) && (
        <div className="-mt-6 mb-10 flex justify-center">
          <Badge>{t('landing.pricing.examplePrices')}</Badge>
        </div>
      )}

      {products.isPending && <PricingSkeleton />}

      {products.isError && (
        <Card padding="lg" role="alert" className="mx-auto max-w-lg text-center">
          <AlertCircle className="mx-auto size-8 text-loss" aria-hidden="true" />
          <p className="mt-3 font-semibold">{t('landing.pricing.error')}</p>
          <Button variant="secondary" className="mt-5" onClick={() => void products.refetch()}>
            <RotateCw aria-hidden="true" /> {t('common.retry')}
          </Button>
        </Card>
      )}

      {products.isSuccess && products.data.items.length === 0 && (
        <Card padding="lg" className="mx-auto max-w-lg text-center">
          <p className="font-semibold">{t('landing.pricing.empty')}</p>
        </Card>
      )}

      {products.isSuccess && products.data.items.length > 0 && (
        <RevealGroup className={cn(GRID, 'pt-3')}>
          {products.data.items.map((p) => (
            <RevealItem key={p.id} className={CARD_WIDTH}>
              <PricingCard product={p} />
            </RevealItem>
          ))}
        </RevealGroup>
      )}

      <div className="mt-12 flex flex-col items-center gap-3 text-center">
        <p className="text-muted">{t('landing.pricing.customPrompt')}</p>
        <Button variant="secondary" size="lg" onClick={() => setCustomOpen(true)}>
          <SlidersHorizontal aria-hidden="true" /> {t('landing.pricing.custom')}{' '}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <CustomAccountModal open={customOpen} onOpenChange={setCustomOpen} />
      <p className="mx-auto mt-10 max-w-3xl text-center text-xs text-muted">
        {t('landing.pricing.disclaimer')}
      </p>
    </LandingSection>
  );
}
