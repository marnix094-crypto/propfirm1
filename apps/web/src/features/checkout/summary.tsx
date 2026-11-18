import { useTranslation } from 'react-i18next';
import type { ProductRules } from '@/hooks/use-catalog';
import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/hooks/use-format';

/** Size + key rules of the account being bought. */
export function PurchaseSummary({ sizeMinor, rules }: { sizeMinor: string; rules: ProductRules }) {
  const { t } = useTranslation();
  const f = useFormat();
  const rows: [string, string][] = [
    [t('landing.pricing.dailyLoss'), f.bps(rules.maxDailyLossBps)],
    [
      t('landing.pricing.maxDrawdown'),
      `${f.bps(rules.maxDrawdownBps)} · ${t(`landing.pricing.drawdownType.${rules.drawdownType}`)}`,
    ],
    [t('landing.pricing.profitSplit'), f.bps(rules.profitSplitBps)],
    [t('landing.pricing.leverage'), f.leverage(rules.maxLeverage)],
  ];
  if (rules.payoutIntervalDays != null)
    rows.push([t('checkout.payoutEvery'), t('checkout.days', { count: rules.payoutIntervalDays })]);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">{t('checkout.instant')}</p>
        <Badge variant="simulated">{t('checkout.simulated')}</Badge>
        {rules.isExample && <Badge>{t('app.rules.example')}</Badge>}
      </div>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">
        {f.moneyWhole(sizeMinor, 'USD')}
      </p>
      <dl className="mt-4 divide-y divide-border border-y border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TestPaymentBadge() {
  const { t } = useTranslation();
  return <Badge variant="warning">{t('checkout.testPayment')}</Badge>;
}
