import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/field';
import { PageHeader, Panel } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import { useCopier, useCopierMutations } from '@/hooks/use-features';
import { useAccounts } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';

const MULTIPLIERS = [2500, 5000, 10000, 20000, 30000];

/** Trade Copier: mirror trades from one of your accounts to your other accounts. */
export function CopierPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const accounts = useAccounts();
  const copier = useCopier();
  const { create, update, remove } = useCopierMutations();
  const list = accounts.data ?? [];
  const tradable = list.filter((a) => a.status === 'ACTIVE' || a.status === 'FUNDED_ACTIVE');
  const [master, setMaster] = useState('');
  const [follower, setFollower] = useState('');
  const [mult, setMult] = useState(10000);
  const label = (id: string) => list.find((a) => a.id === id)?.label ?? '—';
  const ratio = (bps: number) =>
    `${new Intl.NumberFormat(f.locale, { maximumFractionDigits: 2 }).format(bps / 10_000)}×`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { masterAccountId: master, followerAccountId: follower, multiplierBps: mult },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: t('copier.created') });
          setFollower('');
        },
        onError: (err) => toast({ kind: 'error', title: errorMessage(t, err) }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.copier')} subtitle={t('copier.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel title={t('copier.new')} bodyClassName="p-5">
          {tradable.length < 2 ? (
            <p className="text-sm text-muted">{t('copier.needTwo')}</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Select
                label={t('copier.master')}
                value={master}
                required
                onChange={(e) => setMaster(e.target.value)}
              >
                <option value="" disabled>
                  {t('copier.choose')}
                </option>
                {tradable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
              <Select
                label={t('copier.follower')}
                value={follower}
                required
                onChange={(e) => setFollower(e.target.value)}
              >
                <option value="" disabled>
                  {t('copier.choose')}
                </option>
                {tradable
                  .filter((a) => a.id !== master)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
              </Select>
              <Select
                label={t('copier.multiplier')}
                value={String(mult)}
                onChange={(e) => setMult(Number(e.target.value))}
              >
                {MULTIPLIERS.map((m) => (
                  <option key={m} value={m}>
                    {ratio(m)}
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={!master || !follower || create.isPending}>
                {t('copier.create')}
              </Button>
              <p className="text-xs text-muted">{t('copier.note')}</p>
            </form>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={t('copier.links')}>
            {copier.isPending ? (
              <Skeleton className="m-5 h-20" />
            ) : (copier.data?.links.length ?? 0) === 0 ? (
              <EmptyState title={t('copier.noLinks')} body={t('copier.noLinksBody')} />
            ) : (
              <ul className="divide-y divide-border" data-testid="copier-links">
                {copier.data!.links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
                      {label(l.masterAccountId)}
                      <ArrowRight className="size-4 text-muted" aria-hidden="true" />
                      {label(l.followerAccountId)}
                      <span className="text-muted tabular-nums">{ratio(l.multiplierBps)}</span>
                    </span>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        className="size-5 accent-[var(--primary)]"
                        checked={l.active}
                        onChange={(e) =>
                          update.mutate({ id: l.id, body: { active: e.target.checked } })
                        }
                      />
                      {l.active ? t('copier.on') : t('copier.off')}
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('copier.delete')}
                      onClick={() => remove.mutate(l.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={t('copier.activity')}>
            {(copier.data?.events.length ?? 0) === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">{t('copier.noActivity')}</p>
            ) : (
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[480px] text-sm">
                  <tbody>
                    {copier.data!.events.map((e) => (
                      <tr key={e.id} className="border-t border-border first:border-t-0">
                        <td className="px-5 py-2.5 text-muted tabular-nums">
                          {new Intl.DateTimeFormat(f.locale, { timeStyle: 'short' }).format(
                            new Date(e.createdAt),
                          )}
                        </td>
                        <td className="px-5 py-2.5 font-medium">
                          {t(`history.side.${e.side}`)} {e.qty} {e.symbol}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <Badge
                            variant={
                              e.status === 'COPIED'
                                ? 'success'
                                : e.status === 'FAILED'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {t(`copier.status.${e.status}`)}
                          </Badge>
                          {e.code && (
                            <span className="ml-2 text-xs text-muted">
                              {t(`errors.${e.code}`, { defaultValue: e.code })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
