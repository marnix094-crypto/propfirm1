import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, RotateCcw, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { EquityChart } from '@/components/charts/equity-chart';
import {
  useAccounts,
  useActiveAccount,
  useEquity,
  usePerformance,
  usePositions,
  useResetDemo,
  type EquityRange,
} from '@/hooks/use-trading';
import { useFunding } from '@/hooks/use-checkout';
import { useTraderProfile } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/api-client';
import { useSession } from '@/stores/session';
import { MarketsList } from './markets-list';
import { amsterdamToday, PnlCalendar } from './pnl-calendar';
import { AccountClosedBanner, RulesCard } from '../rules/rules-card';
import { FundingCard } from '../funding/funding-card';
import {
  ActiveAccounts,
  ChangePill,
  IconTile,
  pctOf,
  ProfileCard,
  ProgressBar,
  StatCard,
  useNow,
} from './dashboard-widgets';

const RANGES: EquityRange[] = ['1D', '1W', '1M', '3M'];

/** 0–100: share of equity not used as margin. */
export function marginHealth(a: Pick<Account, 'equityMinor' | 'usedMarginMinor'>): number {
  const equity = BigInt(a.equityMinor);
  if (equity <= 0n) return 0;
  const used = BigInt(a.usedMarginMinor);
  const free = equity - used;
  return Math.max(0, Math.min(100, Number((free * 100n) / equity)));
}

function countdown(ms: number): { d: number; h: number } {
  const totalH = Math.max(0, Math.floor(ms / 3_600_000));
  return { d: Math.floor(totalH / 24), h: totalH % 24 };
}

/** Dashboard overview (layout after the supplied design, in the Daily Funded light theme). */
export function PortfolioPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const { account, isPending, isError, refetch } = useActiveAccount();
  const accounts = useAccounts();
  const user = useSession((s) => s.user);
  const profile = useTraderProfile();
  const now = useNow();
  const [range, setRange] = useState<EquityRange>('1M');
  const [confirmReset, setConfirmReset] = useState(false);
  const [month] = useState(() => amsterdamToday().slice(0, 7));
  const equity = useEquity(account?.id, range);
  const positions = usePositions(account?.id);
  const performance = usePerformance(account?.id, month);
  const funding = useFunding(account?.id, account?.kind === 'FUNDED');
  const reset = useResetDemo(account?.id);
  const money = useCallback(
    (m: bigint | string) => f.money(m, account?.currency ?? 'USD'),
    [f, account?.currency],
  );
  const memberSince = useMemo(() => {
    const first = (accounts.data ?? []).reduce<string | null>(
      (min, a) => (min === null || a.createdAt < min ? a.createdAt : min),
      null,
    );
    return first
      ? new Intl.DateTimeFormat(f.locale, { month: 'long', year: 'numeric' }).format(
          new Date(first),
        )
      : null;
  }, [accounts.data, f.locale]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('app.account.loading')}>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    );
  }
  if (isError || !account)
    return (
      <ErrorState title={t('app.account.error')} retryLabel={t('common.retry')} onRetry={refetch} />
    );

  const initial = BigInt(account.initialBalanceMinor);
  const total = BigInt(account.equityMinor) - initial;
  const totalBps = initial > 0n ? Number((total * 10_000n) / initial) : 0;
  const stats = performance.data?.stats;
  const signed = (m: bigint) => f.money(m, account.currency, { signDisplay: 'exceptZero' });
  const name = profile.data?.nickname ?? user?.email.split('@')[0] ?? '';
  const fd = funding.data;
  const scaling = fd?.scaling;
  const payout = fd?.payout;
  const daily = BigInt(account.dailyPnlMinor);

  return (
    <div className="flex flex-col gap-5">
      <title>{t('app.top.overview')}</title>
      <h1 className="sr-only">{t('app.top.overview')}</h1>
      <AccountClosedBanner account={account} />

      {/* Row 1: capital · target · payout */}
      <section aria-label={t('dashboard.kpis')} className="grid gap-4 md:grid-cols-3">
        <StatCard label={t('dashboard.capital')}>
          <div className="flex flex-wrap items-center gap-3">
            <p
              className="font-display text-3xl font-semibold tracking-tight tabular-nums"
              data-testid="account-value"
            >
              {money(account.equityMinor)}
            </p>
            <ChangePill bps={totalBps} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {account.label} · {t('dashboard.today')}{' '}
            <span
              className={cn(
                'font-semibold',
                daily > 0n ? 'text-profit' : daily < 0n ? 'text-loss' : undefined,
              )}
            >
              {signed(daily)}
            </span>
          </p>
        </StatCard>

        {account.kind === 'FUNDED' && scaling ? (
          <StatCard label={t('dashboard.scalingTarget')}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                {money(scaling.profitMinor)}
              </p>
              <p className="text-sm text-muted tabular-nums">{money(scaling.targetMinor)}</p>
            </div>
            <div className="mt-4">
              <ProgressBar
                value={pctOf(BigInt(scaling.profitMinor), BigInt(scaling.targetMinor))}
                label={t('dashboard.scalingTarget')}
              />
            </div>
          </StatCard>
        ) : (
          <StatCard label={t('dashboard.marginFreeTitle')}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                {money(account.freeMarginMinor)}
              </p>
              <p className="text-sm text-muted tabular-nums">{marginHealth(account)}%</p>
            </div>
            <div className="mt-4">
              <ProgressBar value={marginHealth(account)} label={t('dashboard.marginFreeTitle')} />
            </div>
          </StatCard>
        )}

        <StatCard label={t('dashboard.nextPayout')}>
          <div className="flex items-center gap-4">
            <IconTile>
              <Clock className="size-5" />
            </IconTile>
            {account.kind === 'FUNDED' && payout ? (
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                  {payout.eligible
                    ? t('dashboard.payoutNow')
                    : (() => {
                        const c = countdown(new Date(payout.eligibleFrom).getTime() - now);
                        return t('dashboard.countdown', { d: c.d, h: c.h });
                      })()}
                </p>
                <p className="text-xs text-muted">
                  {t('dashboard.estimated', { amount: money(fd!.traderShareMinor) })}
                </p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">{t('dashboard.payoutFundedOnly')}</p>
                <Link
                  to={`/${lang}/app/new-account`}
                  className="text-xs font-semibold text-link hover:underline"
                >
                  {t('app.nav.newAccount')} →
                </Link>
              </div>
            )}
          </div>
        </StatCard>
      </section>

      {/* Row 2: equity chart · profile & win rate */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card padding="none" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <IconTile>
                <BarChart3 className="size-5" />
              </IconTile>
              <div>
                <p className="text-sm text-muted">{t('dashboard.yourEquity')}</p>
                <p className="font-display text-2xl font-semibold tracking-tight tabular-nums">
                  {money(account.equityMinor)}
                </p>
              </div>
            </div>
            <Tabs
              label={t('app.trade.timeframe')}
              value={range}
              onValueChange={(v) => setRange(v as EquityRange)}
              items={RANGES.map((r) => ({ value: r, label: t(`range.${r}`, { defaultValue: r }) }))}
            />
          </div>
          <div className="mt-4">
            {equity.isPending ? (
              <Skeleton className="h-72 rounded-card" />
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
                formatValue={(v) => money(v)}
                className="h-72 w-full"
              />
            )}
          </div>
        </Card>
        <ProfileCard
          name={name}
          memberSince={memberSince}
          winRateBps={stats?.winRateBps ?? null}
          account={account}
        />
      </div>

      {/* Row 3: active accounts */}
      <ActiveAccounts current={account} />

      {/* Row 4: calendar · rules & funding */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PnlCalendar accountId={account.id} currency={account.currency} />
          <Card padding="none">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
              <h2 className="text-[15px] font-semibold">{t('app.portfolio.positions')}</h2>
              <div className="flex gap-2">
                {account.kind === 'DEMO' && (
                  <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                    <RotateCcw aria-hidden="true" /> {t('app.portfolio.reset')}
                  </Button>
                )}
                <Button size="sm" asChild>
                  <Link to={`/${lang}/app/trade`}>
                    <Wallet aria-hidden="true" /> {t('app.portfolio.trade')}
                  </Link>
                </Button>
              </div>
            </div>
            {positions.isPending ? (
              <Skeleton className="m-5 h-16" />
            ) : (positions.data?.length ?? 0) === 0 ? (
              <EmptyState
                title={t('app.portfolio.noPositions')}
                body={t('app.portfolio.noPositionsBody')}
              />
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      {['symbol', 'side', 'size', 'entry', 'mark', 'pnl'].map((c) => (
                        <th
                          key={c}
                          scope="col"
                          className={cn(
                            'px-5 py-2.5 font-medium',
                            ['size', 'entry', 'mark', 'pnl'].includes(c) && 'text-right',
                          )}
                        >
                          {t(`dashboard.positions.${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.data!.map((p) => {
                      const pnl = p.unrealizedPnlMinor ? BigInt(p.unrealizedPnlMinor) : null;
                      return (
                        <tr key={p.id} className="border-t border-border hover:bg-card-muted">
                          <td className="px-5 py-3 font-medium">
                            <Link to={`/${lang}/app/trade/${p.symbol}`} className="hover:underline">
                              {p.symbol}
                            </Link>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                'text-xs font-semibold',
                                p.side === 'LONG' ? 'text-profit' : 'text-loss',
                              )}
                            >
                              {t(`app.trade.${p.side}`)} {f.leverage(p.leverage)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">{p.qty}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{p.avgEntryPrice}</td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {p.markPrice ?? '—'}
                          </td>
                          <td
                            className={cn(
                              'px-5 py-3 text-right font-semibold tabular-nums',
                              pnl === null ? 'text-muted' : pnl >= 0n ? 'text-profit' : 'text-loss',
                            )}
                          >
                            {pnl === null ? '—' : signed(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <RulesCard account={account} />
          <FundingCard account={account} />
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
