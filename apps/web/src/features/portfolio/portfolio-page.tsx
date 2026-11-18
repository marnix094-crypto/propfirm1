import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CandlestickChart, ChevronDown, RotateCcw } from 'lucide-react';
import { meterState } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { RadialMeter } from '@/components/ui/radial-meter';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { EquityChart } from '@/components/charts/equity-chart';
import {
  useActiveAccount,
  useEquity,
  usePositions,
  useResetDemo,
  type EquityRange,
} from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/api-client';
import { AssetAvatar, MarketsList } from './markets-list';
import { AccountClosedBanner, RulesCard } from '../rules/rules-card';

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M', '6M', '1Y'];

/** 0–100: share of equity not used as margin. */
export function marginHealth(a: Pick<Account, 'equityMinor' | 'usedMarginMinor'>): number {
  const equity = BigInt(a.equityMinor);
  if (equity <= 0n) return 0;
  const used = BigInt(a.usedMarginMinor);
  const free = equity - used;
  return Math.max(0, Math.min(100, Number((free * 100n) / equity)));
}

function ActionButton({
  icon: Icon,
  label,
  ...rest
}: { icon: typeof RotateCcw; label: string } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="group flex flex-col items-center gap-2 text-sm font-semibold"
      {...rest}
    >
      <span className="btn-primary inline-flex size-14 items-center justify-center rounded-full transition-transform motion-safe:group-hover:-translate-y-0.5">
        <Icon className="size-6" aria-hidden="true" strokeWidth={1.8} />
      </span>
      {label}
    </button>
  );
}

export function PortfolioPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const { account, isPending, isError, refetch } = useActiveAccount();
  const [range, setRange] = useState<EquityRange>('1M');
  const [details, setDetails] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const equity = useEquity(account?.id, range);
  const positions = usePositions(account?.id);
  const reset = useResetDemo(account?.id);
  const money = useCallback(
    (m: bigint) => f.money(m, account?.currency ?? 'USD'),
    [f, account?.currency],
  );

  if (isPending) {
    return (
      <div
        className="flex flex-col items-center gap-4 py-10"
        aria-busy="true"
        aria-label={t('app.account.loading')}
      >
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }
  if (isError || !account)
    return (
      <ErrorState title={t('app.account.error')} retryLabel={t('common.retry')} onRetry={refetch} />
    );

  const daily = BigInt(account.dailyPnlMinor);
  const dayStart = BigInt(account.equityMinor) - daily;
  const dailyBps = dayStart > 0n ? Number((daily * 10_000n) / dayStart) : 0;
  const health = marginHealth(account);

  return (
    <div className="flex flex-col gap-5">
      <title>{t('app.portfolio.title')}</title>
      <h1 className="sr-only">{t('app.portfolio.title')}</h1>

      <section
        className="flex flex-col items-center pt-2 text-center"
        aria-labelledby="value-label"
      >
        <p id="value-label" className="text-sm font-medium text-muted">
          {t('app.portfolio.value')}
        </p>
        <p
          className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
          data-testid="account-value"
        >
          {money(BigInt(account.equityMinor))}
        </p>
        <p
          className={cn(
            'mt-1.5 text-sm font-semibold tabular-nums',
            daily >= 0n ? 'text-profit' : 'text-loss',
          )}
        >
          {f.money(daily, account.currency, { signDisplay: 'exceptZero' })} (
          {daily >= 0n ? '+' : ''}
          {f.bps(dailyBps)}) {t('app.portfolio.today')}
        </p>
        <div className="mt-2 flex gap-2">
          <Badge variant="simulated">{t(`app.account.kinds.${account.kind}`)}</Badge>
          {account.status === 'FAILED' && (
            <Badge variant="danger">{t('app.account.statuses.FAILED')}</Badge>
          )}
          {account.kind === 'DEMO' && <Badge>{t('app.account.virtual')}</Badge>}
        </div>

        <div className="mt-6 flex gap-8">
          <Link
            to={`/${lang}/app/trade`}
            className="group flex flex-col items-center gap-2 text-sm font-semibold"
          >
            <span className="btn-primary inline-flex size-14 items-center justify-center rounded-full transition-transform motion-safe:group-hover:-translate-y-0.5">
              <CandlestickChart className="size-6" aria-hidden="true" strokeWidth={1.8} />
            </span>
            {t('app.portfolio.trade')}
          </Link>
          {account.kind === 'DEMO' && (
            <ActionButton
              icon={RotateCcw}
              label={t('app.portfolio.reset')}
              onClick={() => setConfirmReset(true)}
            />
          )}
          <ActionButton
            icon={ChevronDown}
            label={t('app.portfolio.details')}
            aria-expanded={details}
            aria-controls="account-details"
            onClick={() => setDetails((d) => !d)}
          />
        </div>
      </section>

      <AccountClosedBanner account={account} />

      {details && (
        <Card id="account-details" padding="md">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
            {[
              ['balance', money(BigInt(account.balanceMinor))],
              [
                'unrealized',
                f.money(account.unrealizedPnlMinor, account.currency, {
                  signDisplay: 'exceptZero',
                }),
              ],
              ['usedMargin', money(BigInt(account.usedMarginMinor))],
              ['freeMargin', money(BigInt(account.freeMarginMinor))],
              ['marginLevel', account.marginLevelBps ? f.bps(Number(account.marginLevelBps)) : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{t(`app.portfolio.${k}`)}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card padding="none" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
              <h2 className="text-lg font-semibold">{t('app.portfolio.equityCurve')}</h2>
              <Tabs
                label={t('app.trade.timeframe')}
                value={range}
                onValueChange={(v) => setRange(v as EquityRange)}
                items={RANGES.map((r) => ({
                  value: r,
                  label: t(`range.${r}`, { defaultValue: r }),
                }))}
              />
            </div>
            <div className="px-2 pt-3 pb-4">
              {equity.isPending ? (
                <Skeleton className="mx-3 h-56" />
              ) : equity.isError ? (
                <ErrorState
                  title={t('errors.generic')}
                  retryLabel={t('common.retry')}
                  onRetry={() => void equity.refetch()}
                />
              ) : (equity.data?.length ?? 0) < 2 ? (
                <EmptyState
                  title={t('app.portfolio.equityCurve')}
                  body={t('app.portfolio.noHistory')}
                />
              ) : (
                <EquityChart
                  points={equity.data!}
                  label={t('app.portfolio.equityCurve')}
                  formatValue={money}
                  className="h-56 w-full sm:h-64"
                />
              )}
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <h2 className="px-5 pt-5 text-lg font-semibold">{t('app.portfolio.positions')}</h2>
            {positions.isPending ? (
              <Skeleton className="m-5 h-16" />
            ) : (positions.data?.length ?? 0) === 0 ? (
              <EmptyState
                title={t('app.portfolio.noPositions')}
                body={t('app.portfolio.noPositionsBody')}
                action={
                  <Button size="sm" asChild>
                    <Link to={`/${lang}/app/trade`}>{t('app.portfolio.trade')}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="px-3 pb-3">
                {positions.data!.map((p) => {
                  const pnl = p.unrealizedPnlMinor ? BigInt(p.unrealizedPnlMinor) : null;
                  return (
                    <li key={p.id} className="border-t border-border first:border-t-0">
                      <Link
                        to={`/${lang}/app/trade/${p.symbol}`}
                        className="flex items-center gap-3 rounded-[14px] px-2 py-3 hover:bg-primary-tint/20"
                      >
                        <AssetAvatar asset={p.symbol.replace('USDT', '')} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-semibold">
                            {p.symbol}
                            <Badge variant={p.side === 'LONG' ? 'success' : 'danger'}>
                              {t(`app.trade.${p.side}`)}
                            </Badge>
                          </span>
                          <span className="block text-sm text-muted tabular-nums">
                            {p.qty} · {f.leverage(p.leverage)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            pnl === null ? 'text-muted' : pnl >= 0n ? 'text-profit' : 'text-loss',
                          )}
                        >
                          {pnl === null
                            ? '—'
                            : f.money(pnl, account.currency, { signDisplay: 'exceptZero' })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <RulesCard account={account} />
          <Card padding="lg" className="flex items-center gap-5">
            <RadialMeter
              value={health}
              state={meterState(BigInt(100 - health), 100n)}
              label={t('app.portfolio.health')}
              valueText={`${health} / 100`}
              size={104}
            >
              <span className="text-2xl font-bold tabular-nums">{health}</span>
            </RadialMeter>
            <div>
              <h2 className="font-semibold">{t('app.portfolio.health')}</h2>
              <p className="mt-1 text-sm text-muted">{t('app.portfolio.healthHint')}</p>
            </div>
          </Card>
          <MarketsList />
        </div>
      </div>

      <Modal
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('app.portfolio.resetTitle')}
        description={t('app.portfolio.resetBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => {
                  setConfirmReset(false);
                  toast({ kind: 'success', title: t('app.portfolio.resetDone') });
                },
                onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
              })
            }
          >
            {t('common.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
