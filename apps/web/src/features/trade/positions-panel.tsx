import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, X } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useCancelOrder,
  useClosePosition,
  useOrders,
  usePositions,
  useUpdatePosition,
} from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { normalizeDecimalInput } from '@/lib/decimal';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import type { Account, Order, Position } from '@/lib/api-client';

function Cell({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

function EditSlTp({
  position,
  accountId,
  onClose,
}: {
  position: Position;
  accountId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdatePosition(accountId);
  const [sl, setSl] = useState(position.slPrice ?? '');
  const [tp, setTp] = useState(position.tpPrice ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('app.trade.editTitle')}
      description={`${position.symbol} · ${t(`app.trade.${position.side}`)}`}
      closeLabel={t('common.close')}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            {
              positionId: position.id,
              slPrice: normalizeDecimalInput(sl),
              tpPrice: normalizeDecimalInput(tp),
            },
            {
              onSuccess: () => {
                toast({ kind: 'success', title: t('app.trade.slTpSaved') });
                onClose();
              },
              onError: (err) => setError(errorMessage(t, err)),
            },
          );
        }}
      >
        <Input
          label={t('app.trade.sl')}
          inputMode="decimal"
          value={sl}
          onChange={(e) => setSl(e.target.value)}
          hint={t('common.optional')}
        />
        <Input
          label={t('app.trade.tp')}
          inputMode="decimal"
          value={tp}
          onChange={(e) => setTp(e.target.value)}
          hint={t('common.optional')}
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-loss">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PositionRow({ p, account }: { p: Position; account: Account }) {
  const { t } = useTranslation();
  const f = useFormat();
  const close = useClosePosition(account.id);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pnl = p.unrealizedPnlMinor === null ? null : BigInt(p.unrealizedPnlMinor);
  return (
    <li
      className="border-t border-border py-3.5 first:border-t-0"
      data-testid={`position-${p.symbol}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-bold">{p.symbol}</span>
        <Badge variant={p.side === 'LONG' ? 'success' : 'danger'}>{t(`app.trade.${p.side}`)}</Badge>
        <Badge>{f.leverage(p.leverage)}</Badge>
        <span
          className={cn(
            'ml-auto font-bold tabular-nums',
            pnl === null ? 'text-muted' : pnl >= 0n ? 'text-profit' : 'text-loss',
          )}
        >
          {pnl === null ? '—' : f.money(pnl, account.currency, { signDisplay: 'exceptZero' })}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm sm:grid-cols-5">
        <Cell label={t('app.trade.size')}>{p.qty}</Cell>
        <Cell label={t('app.trade.entry')}>{p.avgEntryPrice}</Cell>
        <Cell label={t('app.trade.mark')}>{p.markPrice ?? '—'}</Cell>
        <Cell label={t('app.trade.sl')}>{p.slPrice ?? '—'}</Cell>
        <Cell label={t('app.trade.tp')}>{p.tpPrice ?? '—'}</Cell>
      </dl>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing(true)}
          aria-label={`${t('app.trade.edit')} ${p.symbol}`}
        >
          <Pencil aria-hidden="true" /> {t('app.trade.sl')}/{t('app.trade.tp')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={close.isPending}
          aria-label={`${t('app.trade.close')} ${p.symbol}`}
          onClick={() => setConfirming(true)}
        >
          <X aria-hidden="true" /> {t('app.trade.close')}
        </Button>
      </div>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title={t('app.trade.closeConfirm', { symbol: p.symbol })}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={close.isPending}
            onClick={() =>
              close.mutate(
                { positionId: p.id },
                {
                  onSuccess: (o) => {
                    setConfirming(false);
                    toast({
                      kind: 'success',
                      title: t('app.trade.positionClosed'),
                      body: o?.avgFillPrice ? `@ ${o.avgFillPrice}` : undefined,
                    });
                  },
                  onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
                },
              )
            }
          >
            {t('app.trade.closePosition')}
          </Button>
        </div>
      </Modal>
      {editing && (
        <EditSlTp position={p} accountId={account.id} onClose={() => setEditing(false)} />
      )}
    </li>
  );
}

function OrderRow({
  o,
  account,
  cancellable,
}: {
  o: Order;
  account: Account;
  cancellable: boolean;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const cancel = useCancelOrder(account.id);
  const price = o.avgFillPrice ?? o.limitPrice ?? o.stopPrice;
  return (
    <li className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {o.symbol}
          <Badge variant={o.side === 'BUY' ? 'success' : 'danger'}>
            {t(`app.trade.${o.side}`)}
          </Badge>
          <span className="text-sm font-medium text-muted">{t(`app.trade.${o.type}`)}</span>
          {o.source !== 'USER' && <Badge>{t(`app.trade.sources.${o.source}`)}</Badge>}
        </p>
        <p className="text-sm text-muted tabular-nums">
          {o.qty} @ {price ?? t('app.trade.MARKET')} ·{' '}
          {new Date(o.createdAt).toLocaleString(f.locale, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      </div>
      <Badge
        variant={
          o.status === 'FILLED'
            ? 'success'
            : o.status === 'REJECTED'
              ? 'danger'
              : o.status === 'OPEN'
                ? 'primary'
                : 'neutral'
        }
      >
        {t(`app.trade.statuses.${o.status}`)}
      </Badge>
      {cancellable && o.status === 'OPEN' && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`${t('app.trade.cancel')} ${o.symbol}`}
          disabled={cancel.isPending}
          onClick={() =>
            cancel.mutate(o.id, {
              onSuccess: () => toast({ kind: 'success', title: t('app.trade.orderCancelled') }),
              onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
            })
          }
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

export function PositionsPanel({ account }: { account: Account }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('positions');
  const positions = usePositions(account.id);
  const open = useOrders(account.id, 'open');
  const history = useOrders(account.id, 'history');
  const count = (n?: number) => (n ? ` (${n})` : '');

  const body = (
    q: { isPending: boolean; data?: unknown[] },
    empty: string,
    render: () => React.ReactNode,
  ) =>
    q.isPending ? (
      <Skeleton className="my-4 h-14" />
    ) : (q.data?.length ?? 0) === 0 ? (
      <EmptyState title={empty} />
    ) : (
      render()
    );

  return (
    <Tabs
      label={t('app.trade.positions')}
      value={tab}
      onValueChange={setTab}
      className="flex flex-col gap-3"
      items={[
        {
          value: 'positions',
          label: `${t('app.trade.positions')}${count(positions.data?.length)}`,
        },
        { value: 'orders', label: `${t('app.trade.openOrders')}${count(open.data?.length)}` },
        { value: 'history', label: t('app.trade.history') },
      ]}
    >
      <TabsContent value="positions">
        {body(positions, t('app.portfolio.noPositions'), () => (
          <ul>
            {positions.data!.map((p) => (
              <PositionRow key={p.id} p={p} account={account} />
            ))}
          </ul>
        ))}
      </TabsContent>
      <TabsContent value="orders">
        {body(open, t('app.trade.noOrders'), () => (
          <ul>
            {open.data!.map((o) => (
              <OrderRow key={o.id} o={o} account={account} cancellable />
            ))}
          </ul>
        ))}
      </TabsContent>
      <TabsContent value="history">
        {body(history, t('app.trade.noHistory'), () => (
          <ul>
            {history.data!.map((o) => (
              <OrderRow key={o.id} o={o} account={account} cancellable={false} />
            ))}
          </ul>
        ))}
      </TabsContent>
    </Tabs>
  );
}
