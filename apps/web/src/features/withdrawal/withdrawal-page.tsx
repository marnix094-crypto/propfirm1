import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Lock, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { useActiveAccount } from '@/hooks/use-trading';
import { useFunding } from '@/hooks/use-checkout';
import { useFormat } from '@/hooks/use-format';
import { FundingCard } from '../funding/funding-card';

/**
 * Withdrawal: shows whether the active funded account may request a payout and why not.
 * Requests themselves open with KYC + payouts (phase 9); the button stays locked until then.
 */
export function WithdrawalPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const { account, isPending } = useActiveAccount();
  const isFunded = account?.kind === 'FUNDED';
  const funding = useFunding(account?.id, isFunded);

  if (isPending || !account) return <Skeleton className="h-96" />;

  if (!isFunded)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t('app.nav.withdrawal')} />
        <Card padding="md" className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm border border-border bg-card-muted">
            <Wallet className="size-5 text-accent" aria-hidden="true" strokeWidth={1.75} />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">{t('withdrawal.demoTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('withdrawal.demoBody')}</p>
          </div>
          <Button asChild>
            <Link to={`/${lang}/app/new-account`}>{t('app.nav.newAccount')}</Link>
          </Button>
        </Card>
      </div>
    );

  const eligible = !!funding.data?.payout?.eligible;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.withdrawal')} subtitle={account.label} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel title={t('withdrawal.request')} bodyClassName="p-5" data-testid="withdrawal-request">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-muted">{t('withdrawal.available')}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {funding.data ? f.money(funding.data.traderShareMinor, account.currency) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('withdrawal.status')}</dt>
              <dd className="mt-1 font-semibold">
                {eligible ? t('funding.eligible') : t('funding.notYet')}
              </dd>
            </div>
          </dl>
          <Button className="mt-5" disabled>
            <Lock aria-hidden="true" /> {t('withdrawal.requestButton')}
          </Button>
          <p className="mt-3 text-sm text-muted">{t('withdrawal.lockedNote')}</p>
        </Panel>
        <FundingCard account={account} />
      </div>
    </div>
  );
}
