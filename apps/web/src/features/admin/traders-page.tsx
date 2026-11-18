import { useDeferredValue, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Panel, PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import { useAdminMe, useAdminTrader, useAdminTraders, useTraderStatus } from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { countryName } from '@/lib/countries';
import {
  AdminTable,
  dateOnly,
  dateTime,
  LoadMore,
  ReasonDialog,
  StatusBadge,
  Td,
  Th,
  Tr,
} from './ui';
import { AccountRows, ACCOUNT_HEAD } from './accounts-page';

export function AdminTradersPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const query = useDeferredValue(q.trim());
  const list = useAdminTraders({ q: query || undefined, status: status || undefined });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.traders')} subtitle={t('admin.traders.subtitle')} />
      <Card padding="none" className="flex flex-wrap items-end gap-3 p-4">
        <Input
          className="min-w-56 flex-1"
          label={t('admin.traders.search')}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          suffix={<Search className="size-4" aria-hidden="true" />}
        />
        <Select
          className="w-48"
          label={t('admin.traders.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="">{t('admin.all')}</option>
          <option value="ACTIVE">{t('admin.status.ACTIVE')}</option>
          <option value="SUSPENDED">{t('admin.status.SUSPENDED')}</option>
        </Select>
      </Card>
      <Card padding="none">
        {list.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : list.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('admin.traders.emptyTitle')} body={t('admin.traders.emptyBody')} />
        ) : (
          <>
            <AdminTable
              label={t('admin.nav.traders')}
              head={
                <>
                  <Th>{t('admin.traders.email')}</Th>
                  <Th>{t('admin.traders.country')}</Th>
                  <Th>{t('admin.traders.status')}</Th>
                  <Th right>{t('admin.traders.accounts')}</Th>
                  <Th right>{t('admin.traders.funded')}</Th>
                  <Th>{t('admin.traders.joined')}</Th>
                  <Th>{t('admin.traders.lastLogin')}</Th>
                </>
              }
            >
              {rows.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link
                      to={`/${lang}/admin/traders/${u.id}`}
                      className="font-semibold hover:underline"
                    >
                      {u.email}
                    </Link>
                    {u.firmRole && (
                      <span className="ml-2 text-[11px] font-semibold text-accent uppercase">
                        {t(`admin.role.${u.firmRole}`)}
                      </span>
                    )}
                  </Td>
                  <Td>{countryName(u.country, lang ?? 'en')}</Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td right>{u.accounts.total}</Td>
                  <Td right>{u.accounts.funded}</Td>
                  <Td>{dateOnly(u.createdAt, f.locale)}</Td>
                  <Td className="text-muted">
                    {u.lastLoginAt ? f.relativeTime(u.lastLoginAt) : '—'}
                  </Td>
                </Tr>
              ))}
            </AdminTable>
            <LoadMore
              hasMore={!!list.hasNextPage}
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export function AdminTraderPage() {
  const { t } = useTranslation();
  const { lang, id } = useParams();
  const f = useFormat();
  const me = useAdminMe().data;
  const trader = useAdminTrader(id);
  const status = useTraderStatus(id ?? '');
  const [dialog, setDialog] = useState<null | 'suspend' | 'reactivate'>(null);
  const canAct = me?.role === 'OWNER' || me?.role === 'ADMIN';

  if (trader.isPending) return <Skeleton className="h-64 rounded-card" />;
  if (trader.isError)
    return (
      <ErrorState
        title={errorMessage(t, trader.error)}
        retryLabel={t('common.retry')}
        onRetry={() => void trader.refetch()}
      />
    );
  const u = trader.data;
  const staff = !!u.firmRole;

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={`/${lang}/admin/traders`}
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> {t('admin.nav.traders')}
      </Link>
      <PageHeader
        title={u.email}
        subtitle={t('admin.traders.detailSubtitle', {
          date: dateOnly(u.createdAt, f.locale),
          country: countryName(u.country, lang ?? 'en'),
        })}
        actions={
          canAct && !staff ? (
            u.status === 'SUSPENDED' ? (
              <Button variant="secondary" onClick={() => setDialog('reactivate')}>
                {t('admin.traders.reactivate')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setDialog('suspend')}>
                {t('admin.traders.suspend')}
              </Button>
            )
          ) : undefined
        }
      />
      {/* The page h1 is visually hidden on desktop; show the email there too. */}
      <p className="hidden text-xl font-bold tracking-tight lg:block">{u.email}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="none" className="p-5">
          <p className="text-sm text-muted">{t('admin.traders.status')}</p>
          <div className="mt-2">
            <StatusBadge status={u.status} />
          </div>
        </Card>
        <Card padding="none" className="p-5">
          <p className="text-sm text-muted">{t('admin.traders.emailVerified')}</p>
          <p className="mt-2 font-semibold">{u.emailVerified ? t('admin.yes') : t('admin.no')}</p>
        </Card>
        <Card padding="none" className="p-5">
          <p className="text-sm text-muted">{t('admin.traders.twoFactor')}</p>
          <p className="mt-2 font-semibold">
            {u.twoFactorEnabled ? t('admin.yes') : t('admin.no')}
          </p>
        </Card>
        <Card padding="none" className="p-5">
          <p className="text-sm text-muted">{t('admin.traders.nickname')}</p>
          <p className="mt-2 font-semibold">{u.nickname ?? '—'}</p>
        </Card>
      </div>
      <Panel title={t('admin.nav.accounts')}>
        {u.accountList.length === 0 ? (
          <EmptyState title={t('admin.accounts.emptyTitle')} body={t('admin.accounts.emptyBody')} />
        ) : (
          <AdminTable label={t('admin.nav.accounts')} head={<ACCOUNT_HEAD hideTrader />}>
            <AccountRows rows={u.accountList} hideTrader canFail={canAct} />
          </AdminTable>
        )}
      </Panel>
      <Panel title={t('admin.traders.purchases')}>
        {u.purchases.length === 0 ? (
          <EmptyState
            title={t('admin.traders.noPurchases')}
            body={t('admin.traders.noPurchasesBody')}
          />
        ) : (
          <AdminTable
            label={t('admin.traders.purchases')}
            minWidth={560}
            head={
              <>
                <Th>{t('admin.traders.date')}</Th>
                <Th right>{t('admin.products.size')}</Th>
                <Th right>{t('admin.traders.quantity')}</Th>
                <Th right>{t('admin.traders.total')}</Th>
                <Th>{t('admin.traders.status')}</Th>
              </>
            }
          >
            {u.purchases.map((p) => (
              <Tr key={p.id}>
                <Td>{dateTime(p.createdAt, f.locale)}</Td>
                <Td right>{f.money(p.accountSizeMinor, 'USD')}</Td>
                <Td right>{p.quantity}</Td>
                <Td right>{f.money(p.totalMinor, p.currency)}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </Panel>
      <ReasonDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t(`admin.traders.${dialog ?? 'suspend'}Title`)}
        description={t(`admin.traders.${dialog ?? 'suspend'}Body`)}
        confirmLabel={t(`admin.traders.${dialog ?? 'suspend'}`)}
        danger={dialog === 'suspend'}
        pending={status.isPending}
        onConfirm={(reason) =>
          status.mutate(
            { action: dialog!, reason },
            {
              onSuccess: () => {
                setDialog(null);
                toast({ kind: 'success', title: t(`admin.traders.${dialog}Done`) });
              },
              onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
            },
          )
        }
      />
    </div>
  );
}
