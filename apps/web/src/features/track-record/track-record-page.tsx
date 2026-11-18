import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { qk, useAccounts } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { call, client } from '@/lib/api-client';
import { useTradingUi } from '@/stores/trading';
import { cn } from '@/lib/cn';
import { amsterdamToday } from '../portfolio/pnl-calendar';

const statusVariant = (s: string) =>
  s === 'FAILED' ? 'danger' : s === 'FUNDED_ACTIVE' || s === 'PASSED' ? 'success' : 'neutral';

/** Track Record: every account the trader has had, with its result and statistics. */
export function TrackRecordPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const accounts = useAccounts();
  const setActive = useTradingUi((s) => s.setActiveAccount);
  const [month] = useState(() => amsterdamToday().slice(0, 7));
  const perfs = useQueries({
    queries: (accounts.data ?? []).map((a) => ({
      queryKey: qk.performance(a.id, month),
      queryFn: () =>
        call(() =>
          client.GET('/api/v1/accounts/{id}/performance', {
            params: { path: { id: a.id }, query: { month } },
          }),
        ),
    })),
  });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.trackRecord')} subtitle={t('trackRecord.subtitle')} />
      <Panel title={t('trackRecord.accounts')}>
        {accounts.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : (accounts.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('trackRecord.empty')} />
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full min-w-[820px] text-sm" data-testid="track-record">
              <thead>
                <tr className="text-left text-xs text-muted">
                  {[
                    'account',
                    'status',
                    'started',
                    'size',
                    'equity',
                    'return',
                    'trades',
                    'winRate',
                  ].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        'px-4 py-2.5 font-medium whitespace-nowrap',
                        ['size', 'equity', 'return', 'trades', 'winRate'].includes(c) &&
                          'text-right',
                      )}
                    >
                      {t(`trackRecord.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.data!.map((a, i) => {
                  const stats = perfs[i]?.data?.stats;
                  const initial = BigInt(a.initialBalanceMinor);
                  const ret = BigInt(a.equityMinor) - initial;
                  const retBps = initial > 0n ? Number((ret * 10_000n) / initial) : 0;
                  return (
                    <tr key={a.id} className="border-t border-border hover:bg-card-muted">
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => {
                            setActive(a.id);
                            void navigate(`/${lang}/app/stats`);
                          }}
                        >
                          {a.label}
                        </button>
                        <span className="block text-xs font-normal text-muted">
                          {t(`app.account.kinds.${a.kind}`)}
                        </span>
                      </th>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(a.status)}>
                          {t(`app.account.statuses.${a.status}`, { defaultValue: a.status })}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {date(a.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {f.moneyWhole(a.initialBalanceMinor, a.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {f.money(a.equityMinor, a.currency)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-semibold tabular-nums',
                          ret > 0n ? 'text-profit' : ret < 0n ? 'text-loss' : undefined,
                        )}
                      >
                        {`${retBps > 0 ? '+' : ''}${f.bps(retBps)}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{stats?.trades ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {stats?.winRateBps == null ? '—' : f.bps(stats.winRateBps, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
