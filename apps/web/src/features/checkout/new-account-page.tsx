import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/panel';
import { useProducts } from '@/hooks/use-catalog';
import { PricingCard } from '../landing/sections/pricing';
import { CustomAccountModal } from '../landing/sections/custom-account-modal';

/** In-app product picker for a new instant-funding account (leads to the checkout). */
export function NewAccountPage() {
  const { t } = useTranslation();
  const products = useProducts('INSTANT');
  const [custom, setCustom] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t('app.nav.newAccount')}
        subtitle={t('newAccount.subtitle')}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setCustom(true)}>
            <SlidersHorizontal aria-hidden="true" /> {t('landing.pricing.custom')}
          </Button>
        }
      />
      {products.isPending ? (
        <Skeleton className="h-96" />
      ) : products.isError ? (
        <ErrorState
          title={t('landing.pricing.error')}
          retryLabel={t('common.retry')}
          onRetry={() => void products.refetch()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {products.data.items.map((p) => (
            <PricingCard key={p.id} product={p} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">{t('landing.pricing.disclaimer')}</p>
      <CustomAccountModal open={custom} onOpenChange={setCustom} />
    </div>
  );
}
