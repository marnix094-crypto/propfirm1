import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { Tabs } from '@/components/ui/tabs';
import { useActiveAccount, useFills, useOrders } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';

const th = 'px-4 py-2.5 font-medium whitespace-nowrap';
const td = 'px-4 py-3 whitespace-nowrap tabular-nums';

/** Order History: every closed/cancelled/rejected order and every fill of the active account. */
export function OrdersPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const { account, isPending } = useActiveAccount();
  const [tab, setTab] = useState<'orders' | 'fills'>('orders');
  const orders = useOrders(account?.id, 'history');
  const fills = useFills(account?.id);
  const time = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );

  if (isPending || !account) return <Skeleton className="h-96" />;
  const q = tab === 'orders' ? orders : fills;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.orders')} subtitle={account.label} />
      <Panel
        title={tab === 'orders' ? t('history.orders') : t('history.fills')}
        actions={
          <Tabs
            label={t('app.nav.orders')}
            value={tab}
            onValueChange={(v) => setTab(v as 'orders' | 'fills')}
            items={[
              { value: 'orders', label: t('history.orders') },
              { value: 'fills', label: t('history.fills') },
            ]}
          />
        }
      >
        {q.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : q.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void q.refetch()}
          />
        ) : (q.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('history.empty')} body={t('history.emptyBody')} />
        ) : tab === 'orders' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="orders-table">
              <thead>
                <tr className="text-left text-xs text-muted">
                  {['time', 'symbol', 'side', 'type', 'qty', 'price', 'status'].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(th, ['qty', 'price'].includes(c) && 'text-right')}
                    >
                      {t(`history.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.data!.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className={cn(td, 'text-muted')}>{time(o.createdAt)}</td>
                    <td className={cn(td, 'font-medium')}>{o.symbol}</td>
                    <td
                      className={cn(
                        td,
                        'font-semibold',
                        o.side === 'BUY' ? 'text-profit' : 'text-loss',
                      )}
                    >
                      {t(`history.side.${o.side}`)}
                    </td>
                    <td className={td}>
                      {t(`history.type.${o.type}`)}
                      {o.source !== 'USER' && (
                        <span className="ml-1.5 text-xs text-muted">
                          ({t(`history.source.${o.source}`, { defaultValue: o.source })})
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right')}>{o.qty}</td>
                    <td className={cn(td, 'text-right')}>
                      {o.avgFillPrice ?? o.limitPrice ?? o.stopPrice ?? '—'}
                    </td>
                    <td className={td}>
                      {t(`app.trade.statuses.${o.status}`, { defaultValue: o.status })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm" data-testid="fills-table">
              <thead>
                <tr className="text-left text-xs text-muted">
                  {['time', 'symbol', 'side', 'qty', 'price', 'fee', 'realized'].map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        th,
                        ['qty', 'price', 'fee', 'realized'].includes(c) && 'text-right',
                      )}
                    >
                      {t(`history.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fills.data!.map((x) => {
                  const r = BigInt(x.realizedPnlMinor);
                  return (
                    <tr key={x.id} className="border-t border-border">
                      <td className={cn(td, 'text-muted')}>{time(x.executedAt)}</td>
                      <td className={cn(td, 'font-medium')}>{x.symbol}</td>
                      <td
                        className={cn(
                          td,
                          'font-semibold',
                          x.side === 'BUY' ? 'text-profit' : 'text-loss',
                        )}
                      >
                        {t(`history.side.${x.side}`, { defaultValue: x.side })}
                      </td>
                      <td className={cn(td, 'text-right')}>{x.qty}</td>
                      <td className={cn(td, 'text-right')}>{x.price}</td>
                      <td className={cn(td, 'text-right text-muted')}>
                        {f.money(x.commissionMinor, account.currency)}
                      </td>
                      <td
                        className={cn(
                          td,
                          'text-right font-semibold',
                          r > 0n ? 'text-profit' : r < 0n ? 'text-loss' : 'text-muted',
                        )}
                      >
                        {r === 0n
                          ? '—'
                          : f.money(r, account.currency, { signDisplay: 'exceptZero' })}
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
