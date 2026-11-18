import { useTranslation } from 'react-i18next';
import { CalendarDays, OctagonAlert } from 'lucide-react';
import type { MeterState } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Meter } from '@/components/ui/meter';
import { Skeleton } from '@/components/ui/feedback';
import { useRules } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import type { Account } from '@/lib/api-client';

const TRADABLE = ['ACTIVE', 'FUNDED_ACTIVE'];
export const isTradable = (a: Pick<Account, 'status'>) => TRADABLE.includes(a.status);

/** Live rule meters (daily loss, max drawdown, targets) for challenge/funded accounts. */
export function RulesCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const f = useFormat();
  const rules = useRules(account.id, account.hasRules);
  if (!account.hasRules) return null;
  if (rules.isPending || !rules.data) return <Skeleton className="h-56 rounded-card" />;
  const r = rules.data;
  const money = (m: string | null) => (m === null ? '—' : f.money(m, account.currency));
  const stateLabels: Record<MeterState, string> = {
    safe: t('meter.safe'),
    warn: t('meter.warn'),
    breach: t('meter.breach'),
  };

  return (
    <Card padding="md" className="p-5 sm:p-5" data-testid="rules-card">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{t('app.rules.title')}</h2>
        {r.ruleSet?.isExample && <Badge>{t('app.rules.example')}</Badge>}
      </div>
      <div className="mt-5 flex flex-col gap-6">
        {r.rules
          .filter((x) => x.rule === 'DAILY_LOSS' || x.rule === 'MAX_DRAWDOWN')
          .map((x) => {
            const type =
              x.rule === 'MAX_DRAWDOWN' && r.ruleSet
                ? ` (${t(`app.rules.${r.ruleSet.drawdownType}`)})`
                : '';
            const state = r.status === 'FAILED' && r.breach === x.rule ? 'breach' : x.state;
            return (
              <div key={x.rule}>
                <Meter
                  label={`${t(`app.rules.${x.rule}`)}${type}`}
                  used={state === 'breach' ? BigInt(x.limitMinor) : BigInt(x.usedMinor)}
                  limit={BigInt(x.limitMinor)}
                  usedLabel={money(x.usedMinor)}
                  limitLabel={money(x.limitMinor)}
                  stateLabels={stateLabels}
                  warnRatioBps={7000}
                />
                <p className="mt-1 text-xs text-muted tabular-nums">
                  {t('app.rules.floor', { value: money(x.floorEquityMinor) })}
                </p>
              </div>
            );
          })}
      </div>
      <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden="true" />
          <dd>{t('app.rules.tradingDays', { count: r.tradingDays })}</dd>
        </div>
        {r.ruleSet?.profitSplitBps != null && (
          <dd>{t('app.rules.profitSplit', { value: f.bps(r.ruleSet.profitSplitBps) })}</dd>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">{t('app.rules.resetNote')}</p>
    </Card>
  );
}

/** Shown on portfolio and trade when a rule failed the account. */
export function AccountClosedBanner({ account }: { account: Account }) {
  const { t } = useTranslation();
  if (account.status !== 'FAILED') return null;
  const reason =
    account.failReason === 'DAILY_LOSS' || account.failReason === 'MAX_DRAWDOWN'
      ? account.failReason
      : 'other';
  return (
    <div
      role="alert"
      data-testid="account-closed"
      className="flex items-start gap-3 rounded-card border border-[color-mix(in_srgb,var(--loss)_35%,transparent)] bg-[color-mix(in_srgb,var(--loss)_8%,var(--card))] p-5"
    >
      <OctagonAlert className="mt-0.5 size-5 shrink-0 text-loss" aria-hidden="true" />
      <div>
        <p className="font-semibold">{t('app.rules.failedTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t(`app.rules.failedBody.${reason}`)}</p>
      </div>
    </div>
  );
}
