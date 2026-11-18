import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/panel';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toaster';
import {
  useAdminMe,
  useAdminRuleSets,
  useCreateRuleSet,
  type AdminRuleSet,
  type CreateRuleSet,
} from '@/hooks/use-admin';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { AdminTable, Td, Th, Tr } from './ui';
import { toMinor } from './products-page';

/** Percent input ("4.5") ⇄ basis points (450). */
const toBps = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const pct = (bps: number) => String(bps / 100);

function NewVersionDialog({ base, onClose }: { base: AdminRuleSet; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateRuleSet();
  const [name, setName] = useState(base.isTemplate ? `${base.name} (custom)` : base.name);
  const [daily, setDaily] = useState(pct(base.maxDailyLossBps));
  const [dd, setDd] = useState(pct(base.maxDrawdownBps));
  const [ddType, setDdType] = useState(base.drawdownType);
  const [split, setSplit] = useState(base.profitSplitBps === null ? '' : pct(base.profitSplitBps));
  const [leverage, setLeverage] = useState(String(base.maxLeverage));
  const [interval, setInterval] = useState(String(base.payoutIntervalDays ?? ''));
  const [minPayout, setMinPayout] = useState(
    base.minPayoutMinor ? String(Number(base.minPayoutMinor) / 100) : '',
  );
  const dailyBps = toBps(daily);
  const ddBps = toBps(dd);
  const splitBps = split ? toBps(split) : null;
  const lev = Number(leverage);
  const errors = {
    daily: !(dailyBps >= 50 && dailyBps <= 2000)
      ? t('admin.ruleSets.range', { min: 0.5, max: 20 })
      : null,
    dd: !(ddBps >= 100 && ddBps <= 5000) ? t('admin.ruleSets.range', { min: 1, max: 50 }) : null,
    split:
      splitBps !== null && !(splitBps >= 1000 && splitBps <= 10000)
        ? t('admin.ruleSets.range', { min: 10, max: 100 })
        : null,
    leverage: !(Number.isInteger(lev) && lev >= 1 && lev <= 200)
      ? t('admin.ruleSets.range', { min: 1, max: 200 })
      : null,
    order: dailyBps >= ddBps ? t('errors.RULES_INCONSISTENT') : null,
  };
  const valid = name.trim().length >= 2 && Object.values(errors).every((e) => e === null);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.ruleSets.newVersion')}
      description={t('admin.ruleSets.newVersionBody', { name: base.name, version: base.version })}
      closeLabel={t('common.close')}
      className="max-w-xl"
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const body: CreateRuleSet = {
            basedOnId: base.id,
            name: name.trim(),
            maxDailyLossBps: dailyBps,
            maxDrawdownBps: ddBps,
            drawdownType: ddType,
            maxLeverage: lev,
            ...(splitBps !== null ? { profitSplitBps: splitBps } : {}),
            ...(interval ? { payoutIntervalDays: Number(interval) } : {}),
            ...(minPayout && toMinor(minPayout) ? { minPayoutMinor: toMinor(minPayout)! } : {}),
          };
          create.mutate(body, {
            onSuccess: (r) => {
              onClose();
              toast({
                kind: 'success',
                title: t('admin.ruleSets.created', { name: r.name, version: r.version }),
              });
            },
            onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
          });
        }}
      >
        <Input
          label={t('admin.ruleSets.name')}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('admin.ruleSets.dailyLoss')}
            suffix="%"
            inputMode="decimal"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            error={errors.daily}
          />
          <Input
            label={t('admin.ruleSets.maxDrawdown')}
            suffix="%"
            inputMode="decimal"
            value={dd}
            onChange={(e) => setDd(e.target.value)}
            error={errors.dd ?? errors.order}
          />
          <Select
            label={t('admin.ruleSets.drawdownType')}
            value={ddType}
            onChange={(e) => setDdType(e.target.value as typeof ddType)}
          >
            <option value="TRAILING">{t('admin.ruleSets.TRAILING')}</option>
            <option value="STATIC">{t('admin.ruleSets.STATIC')}</option>
          </Select>
          <Input
            label={t('admin.ruleSets.leverage')}
            suffix=":1"
            inputMode="numeric"
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            error={errors.leverage}
          />
          <Input
            label={t('admin.ruleSets.profitSplit')}
            suffix="%"
            inputMode="decimal"
            value={split}
            onChange={(e) => setSplit(e.target.value)}
            error={errors.split}
          />
          <Input
            label={t('admin.ruleSets.payoutInterval')}
            suffix={t('admin.ruleSets.days')}
            inputMode="numeric"
            value={interval}
            onChange={(e) => setInterval(e.target.value.replace(/\D/g, ''))}
          />
          <Input
            label={t('admin.ruleSets.minPayout')}
            suffix="USD"
            inputMode="decimal"
            value={minPayout}
            onChange={(e) => setMinPayout(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted">{t('admin.ruleSets.immutableNote')}</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!valid || create.isPending}>
            {t('admin.ruleSets.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AdminRuleSetsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAdminMe().data;
  const rules = useAdminRuleSets();
  const [base, setBase] = useState<AdminRuleSet | null>(null);
  const canEdit = me?.role === 'OWNER' || me?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('admin.nav.ruleSets')} subtitle={t('admin.ruleSets.subtitle')} />
      <Card padding="none">
        {rules.isPending ? (
          <Skeleton className="m-5 h-40" />
        ) : rules.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void rules.refetch()}
          />
        ) : rules.data.length === 0 ? (
          <EmptyState title={t('admin.ruleSets.emptyTitle')} body={t('admin.ruleSets.emptyBody')} />
        ) : (
          <AdminTable
            label={t('admin.nav.ruleSets')}
            minWidth={980}
            head={
              <>
                <Th>{t('admin.ruleSets.name')}</Th>
                <Th right>{t('admin.ruleSets.dailyLoss')}</Th>
                <Th right>{t('admin.ruleSets.maxDrawdown')}</Th>
                <Th right>{t('admin.ruleSets.profitSplit')}</Th>
                <Th right>{t('admin.ruleSets.leverage')}</Th>
                <Th right>{t('admin.ruleSets.payoutInterval')}</Th>
                <Th right>{t('admin.ruleSets.accounts')}</Th>
                <Th>
                  <span className="sr-only">{t('admin.actions')}</span>
                </Th>
              </>
            }
          >
            {rules.data.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <p className="font-semibold">
                    {r.name} <span className="font-normal text-muted">· v{r.version}</span>
                  </p>
                  <div className="mt-1 flex gap-1.5">
                    {r.isTemplate ? (
                      <Badge>{t('admin.ruleSets.template')}</Badge>
                    ) : (
                      <Badge variant="primary">{t('admin.ruleSets.own')}</Badge>
                    )}
                    {r.isExample && <Badge variant="simulated">{t('common.example')}</Badge>}
                  </div>
                </Td>
                <Td right>{f.bps(r.maxDailyLossBps)}</Td>
                <Td right>
                  {f.bps(r.maxDrawdownBps)}{' '}
                  <span className="text-xs text-muted">
                    {t(`admin.ruleSets.${r.drawdownType}`)}
                  </span>
                </Td>
                <Td right>{r.profitSplitBps === null ? '—' : f.bps(r.profitSplitBps)}</Td>
                <Td right>{f.leverage(r.maxLeverage)}</Td>
                <Td right>
                  {r.payoutIntervalDays
                    ? t('admin.ruleSets.everyDays', { count: r.payoutIntervalDays })
                    : '—'}
                </Td>
                <Td right>{r.accounts}</Td>
                <Td right>
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={() => setBase(r)}>
                      {t('admin.ruleSets.newVersion')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </AdminTable>
        )}
      </Card>
      <p className="text-xs text-muted">{t('admin.ruleSets.immutableNote')}</p>
      {base && <NewVersionDialog key={base.id} base={base} onClose={() => setBase(null)} />}
    </div>
  );
}
