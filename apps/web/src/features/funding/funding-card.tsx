import { useTranslation } from 'react-i18next';
import { Check, Circle, IdCard, TrendingUp, Wallet } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/feedback';
import { useFunding, type FundingProgress } from '@/hooks/use-checkout';
import { useFormat } from '@/hooks/use-format';
import type { Account } from '@/lib/api-client';
import { cn } from '@/lib/cn';

type Condition = NonNullable<FundingProgress['payout']>['conditions'][number];

/** Share of `value` in `target` as 0–100 (bigint-safe, clamped). */
function percent(value: string, target: string): number {
  const v = BigInt(value);
  const tgt = BigInt(target);
  if (tgt <= 0n) return v > 0n ? 100 : 0;
  const p = (v * 100n) / tgt;
  return Number(p > 100n ? 100n : p < 0n ? 0n : p);
}

function Progress({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="h-2.5 overflow-hidden rounded-full bg-[var(--meter-track)]"
    >
      <motion.div
        className="h-full origin-left rounded-full bg-[linear-gradient(90deg,var(--primary-light),var(--accent-deep))]"
        initial={reduce ? false : { scaleX: 0 }}
        animate={{ scaleX: value / 100 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

/** Profit split, payout eligibility and scaling plan of a funded account (simulated). */
export function FundingCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const f = useFormat();
  const isFunded = account.kind === 'FUNDED';
  const funding = useFunding(account.id, isFunded);
  if (!isFunded) return null;
  if (funding.isPending) return <Skeleton className="h-72 rounded-card" />;
  if (funding.isError || !funding.data) return null;
  const d = funding.data;
  const money = (m: string) => f.money(m, account.currency);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(iso));

  const conditionText = (c: Condition) => {
    switch (c.code) {
      case 'PAYOUT_INTERVAL':
        return t('funding.cond.interval', {
          date: date(d.payout!.eligibleFrom),
          current: Math.min(Number(c.current), Number(c.required)),
          required: Number(c.required),
        });
      case 'PAYOUT_TRADING_DAYS':
        return t('funding.cond.tradingDays', {
          current: Math.min(Number(c.current), Number(c.required)),
          required: Number(c.required),
        });
      case 'PAYOUT_MIN_AMOUNT':
        return t('funding.cond.minAmount', { amount: money(c.required) });
      default:
        return t('funding.cond.noOpenPositions');
    }
  };

  return (
    <Card padding="lg" data-testid="funding-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t('funding.title')}</h2>
        {d.isExample && <Badge>{t('app.rules.example')}</Badge>}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-[18px] bg-card-muted p-3.5">
          <dt className="text-xs text-muted">{t('funding.profit')}</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums">{money(d.profitMinor)}</dd>
        </div>
        <div className="rounded-[18px] bg-card-muted p-3.5">
          <dt className="text-xs text-muted">
            {t('funding.share', {
              split: d.profitSplitBps == null ? '—' : f.bps(d.profitSplitBps),
            })}
          </dt>
          <dd className="mt-1 text-lg font-bold text-[var(--profit-text)] tabular-nums">
            {money(d.traderShareMinor)}
          </dd>
        </div>
      </dl>

      {d.payout && (
        <section className="mt-6" aria-labelledby="payout-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="payout-heading" className="flex items-center gap-2 font-semibold">
              <Wallet className="size-4 text-accent" aria-hidden="true" />
              {t('funding.payout')}
            </h3>
            <Badge variant={d.payout.eligible ? 'success' : 'neutral'}>
              {d.payout.eligible ? t('funding.eligible') : t('funding.notYet')}
            </Badge>
          </div>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {d.payout.conditions.map((c) => (
              <li key={c.code} className="flex items-start gap-2.5">
                {c.met ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--profit-text)]"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className={cn(!c.met && 'text-muted')}>
                  <span className="sr-only">
                    {c.met ? t('funding.met') : t('funding.notMet')}:{' '}
                  </span>
                  {conditionText(c)}
                </span>
              </li>
            ))}
            {d.payout.kycRequired && (
              <li className="flex items-start gap-2.5 text-muted">
                <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t('funding.kyc')}
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-muted">{t('funding.requestSoon')}</p>
        </section>
      )}

      {d.scaling && (
        <section className="mt-6" aria-labelledby="scaling-heading">
          <h3 id="scaling-heading" className="flex items-center gap-2 font-semibold">
            <TrendingUp className="size-4 text-accent" aria-hidden="true" />
            {t('funding.scaling')}
          </h3>
          {d.scaling.atMaximum ? (
            <p className="mt-2 text-sm text-muted">{t('funding.scalingMax')}</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">
                {t('funding.scalingBody', {
                  target: f.bps(d.scaling.targetBps),
                  payouts: d.scaling.requiredPayouts,
                  step: f.bps(d.scaling.stepBps),
                  next: f.moneyWhole(d.scaling.nextSizeMinor, account.currency),
                })}
              </p>
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between text-xs tabular-nums">
                  <span>{t('funding.scalingProfit')}</span>
                  <span>
                    {money(d.scaling.profitMinor)} / {money(d.scaling.targetMinor)}
                  </span>
                </div>
                <Progress
                  value={percent(d.scaling.profitMinor, d.scaling.targetMinor)}
                  label={t('funding.scalingProfit')}
                />
                <p className="mt-2 text-xs text-muted tabular-nums">
                  {t('funding.scalingPayouts', {
                    current: d.scaling.payouts,
                    required: d.scaling.requiredPayouts,
                  })}
                </p>
              </div>
            </>
          )}
        </section>
      )}
      <p className="mt-5 text-xs leading-relaxed text-muted">{t('funding.disclaimer')}</p>
    </Card>
  );
}
