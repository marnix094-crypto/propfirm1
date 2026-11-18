import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Copy, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import {
  adminCall,
  adminClient,
  useAdminAudit,
  useAdminMutation,
  useAdminPlayers,
  useAdminRound,
  useAdminRounds,
  useAdminSettings,
  useCompeteAdmin,
  useOperators,
  useOverview,
  usePayouts,
  type AdminPlayer,
  type AdminSettings,
} from './api';
import type { components } from '@brand/shared/api';

type UpdateSettings = components['schemas']['UpdateCompeteSettingsDto'];
import { Kpi, PageTitle, StatusBadge, Table, Td, Th, Tr, useAdminError } from './ui';

function Loading() {
  return <Skeleton className="h-40 w-full rounded-card" />;
}
function Failed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('competeAdmin');
  return <ErrorState title={t('errors.load')} retryLabel={t('retry')} onRetry={onRetry} />;
}
const date = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

// ================================================================ overview

export function CompeteAdminOverviewPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const { lang } = useParams();
  const q = useOverview();
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed onRetry={() => void q.refetch()} />;
  const d = q.data;
  const c = d.current;
  const max = d.recent.reduce((m, r) => (BigInt(r.potMinor) > m ? BigInt(r.potMinor) : m), 1n);
  return (
    <>
      <PageTitle title={t('overview.title')} sub={t('overview.sub')} />
      <Card padding="lg" className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            <span className="text-sm text-muted">{date(c.startsAt, f.locale)}</span>
          </div>
          <p className="mt-2 font-display text-xl font-bold">{t('overview.current')}</p>
        </div>
        <dl className="flex flex-wrap gap-8">
          <div>
            <dt className="text-xs text-muted">{t('overview.participants')}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {c.participants}
              <span className="ml-1 text-sm text-muted">/ {c.minParticipants}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('overview.pot')}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {f.money(c.potMinor, c.currency)}
            </dd>
          </div>
        </dl>
        <Button variant="secondary" size="sm" asChild>
          <Link to={`/${lang}/compete/admin/rounds/${c.id}`}>{t('overview.openRound')}</Link>
        </Button>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi
          label={t('overview.revenue')}
          value={f.money(d.operatorRevenueMinor30d, d.currency)}
          hint={t('overview.last30')}
        />
        <Kpi
          label={t('overview.fees')}
          value={f.money(d.netEntryFeesMinor30d, d.currency)}
          hint={t('overview.feesHint')}
        />
        <Kpi
          label={t('overview.prizes')}
          value={f.money(d.prizesMinor30d, d.currency)}
          hint={t('overview.last30')}
        />
        <Kpi
          label={t('overview.awaiting')}
          value={f.money(d.awaitingPayoutsMinor, d.currency)}
          hint={t('overview.awaitingHint', { count: d.awaitingPayouts })}
        />
        <Kpi label={t('overview.players')} value={d.players} />
        <Kpi label={t('overview.entries')} value={d.entries30d} hint={t('overview.last30')} />
        <Kpi label={t('overview.settled')} value={d.roundsSettled30d} hint={t('overview.last30')} />
        <Kpi
          label={t('overview.cancelled')}
          value={d.roundsCancelled30d}
          hint={t('overview.cancelledHint')}
        />
      </div>
      <Card padding="lg">
        <h2 className="font-semibold">{t('overview.recent')}</h2>
        {d.recent.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t('overview.noRounds')}</p>
        ) : (
          <ul className="mt-6 flex h-48 items-end gap-2" aria-label={t('overview.recent')}>
            {[...d.recent].reverse().map((r) => {
              const pct = Number((BigInt(r.potMinor) * 100n) / max);
              return (
                <li key={r.id} className="flex h-full flex-1 flex-col justify-end">
                  <span className="sr-only">
                    {date(r.startsAt, f.locale)}: {f.money(r.potMinor, d.currency)}
                  </span>
                  <span
                    aria-hidden="true"
                    title={`${date(r.startsAt, f.locale)} · ${f.money(r.potMinor, d.currency)}`}
                    className={cn(
                      'w-full rounded-t-[6px]',
                      r.status === 'CANCELLED' ? 'bg-border-strong' : 'bg-primary',
                    )}
                    style={{ height: `${Math.max(4, pct)}%` }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

// ================================================================ rounds

export function CompeteAdminRoundsPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const { lang } = useParams();
  const q = useAdminRounds();
  return (
    <>
      <PageTitle title={t('rounds.title')} sub={t('rounds.sub')} />
      <Card padding="none">
        {q.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : q.isError ? (
          <Failed onRetry={() => void q.refetch()} />
        ) : (
          <Table
            label={t('rounds.title')}
            head={
              <>
                <Th>{t('rounds.date')}</Th>
                <Th>{t('rounds.status')}</Th>
                <Th right>{t('overview.participants')}</Th>
                <Th right>{t('overview.pot')}</Th>
                <Th right>{t('rounds.prizes')}</Th>
                <Th right>{t('rounds.share')}</Th>
              </>
            }
          >
            {q.data.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <Link
                    to={`/${lang}/compete/admin/rounds/${r.id}`}
                    className="font-semibold text-link hover:underline"
                  >
                    {date(r.startsAt, f.locale)}
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={r.status} />
                </Td>
                <Td right>{r.participants}</Td>
                <Td right>{f.money(r.potMinor, 'USD')}</Td>
                <Td right>{f.money(r.prizesMinor, 'USD')}</Td>
                <Td right>{f.money(r.operatorShareMinor, 'USD')}</Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

export function CompeteAdminRoundPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const { id } = useParams();
  const q = useAdminRound(id);
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failed onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageTitle
        title={t('round.title', { date: date(d.round.startsAt, f.locale) })}
        sub={t('round.sub', { n: d.minParticipants })}
        actions={<StatusBadge status={d.round.status} />}
      />
      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label={t('overview.participants')} value={d.round.participants} />
        <Kpi label={t('overview.pot')} value={f.money(d.round.potMinor, d.currency)} />
        <Kpi label={t('rounds.prizes')} value={f.money(d.round.prizesMinor, d.currency)} />
        <Kpi label={t('rounds.share')} value={f.money(d.round.operatorShareMinor, d.currency)} />
      </div>
      <Card padding="none">
        {d.rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('round.empty')}</p>
        ) : (
          <Table
            label={t('round.ranking')}
            head={
              <>
                <Th>#</Th>
                <Th>{t('round.player')}</Th>
                <Th>{t('rounds.status')}</Th>
                <Th right>{t('round.return')}</Th>
                <Th right>{t('round.equity')}</Th>
                <Th right>{t('round.prize')}</Th>
              </>
            }
          >
            {d.rows.map((r) => {
              const ret = Number(r.returnBps);
              return (
                <Tr key={r.entryId}>
                  <Td>{r.rank}</Td>
                  <Td className="font-medium">{r.nickname}</Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td right className={ret > 0 ? 'text-profit' : ret < 0 ? 'text-loss' : ''}>
                    {(ret > 0 ? '+' : '') + f.bps(ret)}
                  </Td>
                  <Td right>{f.money(r.equityMinor, d.currency)}</Td>
                  <Td right>{r.prizeMinor !== '0' ? f.money(r.prizeMinor, d.currency) : '—'}</Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

// ================================================================ players

export function CompeteAdminPlayersPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const toMessage = useAdminError();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [target, setTarget] = useState<AdminPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const players = useAdminPlayers(term);
  const act = useAdminMutation((v: { id: string; suspend: boolean; reason: string }) =>
    adminCall(() =>
      v.suspend
        ? adminClient.POST('/api/v1/compete/admin/players/{id}/suspend', {
            params: { path: { id: v.id } },
            body: { reason: v.reason },
          })
        : adminClient.POST('/api/v1/compete/admin/players/{id}/reactivate', {
            params: { path: { id: v.id } },
            body: { reason: v.reason },
          }),
    ),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target) return;
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '');
    try {
      await act.mutateAsync({ id: target.id, suspend: target.status !== 'SUSPENDED', reason });
      setTarget(null);
    } catch (err) {
      setError(toMessage(err));
    }
  };
  return (
    <>
      <PageTitle title={t('players.title')} sub={t('players.sub')} />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q);
        }}
        className="flex max-w-md items-end gap-2"
      >
        <div className="flex-1">
          <Input label={t('players.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" aria-label={t('players.search')}>
          <Search aria-hidden="true" />
        </Button>
      </form>
      <Card padding="none">
        {players.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : players.isError ? (
          <Failed onRetry={() => void players.refetch()} />
        ) : players.data.items.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('players.empty')}</p>
        ) : (
          <Table
            label={t('players.title')}
            minWidth={760}
            head={
              <>
                <Th>{t('players.nickname')}</Th>
                <Th>{t('players.email')}</Th>
                <Th>{t('players.country')}</Th>
                <Th>{t('rounds.status')}</Th>
                <Th right>{t('players.entries')}</Th>
                <Th right>{t('players.won')}</Th>
                <Th />
              </>
            }
          >
            {players.data.items.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.nickname}</Td>
                <Td className="text-muted">{p.email}</Td>
                <Td>{p.country}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td right>{p.entries}</Td>
                <Td right>{f.money(p.prizesMinor, 'USD')}</Td>
                <Td right>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setError(null);
                      setTarget(p);
                    }}
                  >
                    {p.status === 'SUSPENDED' ? t('players.reactivate') : t('players.suspend')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={
          target?.status === 'SUSPENDED'
            ? t('players.reactivateTitle', { name: target?.nickname })
            : t('players.suspendTitle', { name: target?.nickname })
        }
        description={t('players.reasonHint')}
        closeLabel={t('close')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input label={t('players.reason')} name="reason" minLength={3} maxLength={300} required />
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
          <Button type="submit" disabled={act.isPending}>
            {target?.status === 'SUSPENDED' ? t('players.reactivate') : t('players.suspend')}
          </Button>
        </form>
      </Modal>
    </>
  );
}

// ================================================================ payouts

export function CompeteAdminPayoutsPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const toMessage = useAdminError();
  const [tab, setTab] = useState<'AWAITING_PAYOUT' | 'SUCCEEDED'>('AWAITING_PAYOUT');
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = usePayouts(tab);
  const mark = useAdminMutation((v: { id: string; reference: string }) =>
    adminCall(() =>
      adminClient.POST('/api/v1/compete/admin/payouts/{id}/mark-paid', {
        params: { path: { id: v.id } },
        body: { reference: v.reference },
      }),
    ),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await mark.mutateAsync({
        id: target!,
        reference: String(new FormData(e.currentTarget).get('reference') ?? ''),
      });
      setTarget(null);
    } catch (err) {
      setError(toMessage(err));
    }
  };
  return (
    <>
      <PageTitle title={t('payouts.title')} sub={t('payouts.sub')} />
      <div
        role="tablist"
        aria-label={t('payouts.title')}
        className="flex w-fit gap-1 rounded-full border border-border bg-card p-1"
      >
        {(['AWAITING_PAYOUT', 'SUCCEEDED'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold',
              tab === s ? 'bg-primary text-[var(--btn-primary-fg)]' : 'text-muted hover:text-fg',
            )}
          >
            {t(`payouts.tab.${s}`)}
          </button>
        ))}
      </div>
      <Card padding="none">
        {q.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : q.isError ? (
          <Failed onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('payouts.empty')}</p>
        ) : (
          <Table
            label={t('payouts.title')}
            head={
              <>
                <Th>{t('rounds.date')}</Th>
                <Th>{t('round.player')}</Th>
                <Th right>#</Th>
                <Th right>{t('round.prize')}</Th>
                <Th>{t('rounds.status')}</Th>
                <Th />
              </>
            }
          >
            {q.data.map((p) => (
              <Tr key={p.id}>
                <Td>{date(p.roundStartsAt, f.locale)}</Td>
                <Td className="font-medium">{p.nickname}</Td>
                <Td right>{p.rank ?? '—'}</Td>
                <Td right>{f.money(p.amountMinor, p.currency)}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td right>
                  {p.status === 'AWAITING_PAYOUT' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setError(null);
                        setTarget(p.id);
                      }}
                    >
                      {t('payouts.markPaid')}
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">{t('payouts.note')}</p>
      <Modal
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('payouts.markPaid')}
        description={t('payouts.referenceHint')}
        closeLabel={t('close')}
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label={t('payouts.reference')}
            name="reference"
            minLength={3}
            maxLength={120}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
          <Button type="submit" disabled={mark.isPending}>
            {t('payouts.confirm')}
          </Button>
        </form>
      </Modal>
    </>
  );
}

// ================================================================ settings

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const centsToStr = (minor: string) => (Number(minor) / 100).toString();
const strToCents = (s: string) => {
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(s.trim());
  return m ? String(BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0')) : null;
};

function SettingsForm({ s }: { s: AdminSettings }) {
  const { t } = useTranslation('competeAdmin');
  const toMessage = useAdminError();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useAdminMutation((body: UpdateSettings) =>
    adminCall(() => adminClient.PUT('/api/v1/compete/admin/settings', { body })),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const fee = strToCents(String(f.get('fee')));
    const balance = strToCents(String(f.get('balance')));
    const [h, m] = String(f.get('start')).split(':').map(Number);
    const split = String(f.get('split'))
      .split('/')
      .map((x) => Math.round(Number(x.trim()) * 100));
    if (!fee || !balance) return setMsg({ ok: false, text: t('errors.VALIDATION_ERROR') });
    setMsg(null);
    try {
      await save.mutateAsync({
        name: String(f.get('name')),
        primaryColor: String(f.get('color')),
        domain: String(f.get('domain') ?? '').trim() || null,
        timeZone: String(f.get('tz')),
        startMinuteOfDay: (h ?? 0) * 60 + (m ?? 0),
        durationMinutes: Number(f.get('duration')),
        entryFeeMinor: fee,
        startBalanceMinor: balance,
        leverage: Number(f.get('leverage')),
        maxDrawdownBps: Math.round(Number(f.get('drawdown')) * 100),
        minParticipants: Number(f.get('min')),
        prizePoolBps: Math.round(Number(f.get('pool')) * 100),
        prizeSplitBps: split,
      });
      setMsg({ ok: true, text: t('settings.saved') });
    } catch (err) {
      setMsg({ ok: false, text: toMessage(err) });
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <Card padding="lg" className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t('settings.brand')}</h2>
        <Input
          label={t('settings.name')}
          name="name"
          defaultValue={s.name}
          required
          minLength={2}
          maxLength={60}
        />
        <Input
          label={t('settings.color')}
          name="color"
          type="color"
          defaultValue={s.primaryColor}
          className="h-11 p-1"
        />
        <Input
          label={t('settings.domain')}
          name="domain"
          defaultValue={s.domain ?? ''}
          placeholder="play.example.com"
          hint={t('settings.domainHint')}
        />
        <Input label={t('settings.tz')} name="tz" defaultValue={s.timeZone} required />
      </Card>
      <Card padding="lg" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <h2 className="font-semibold sm:col-span-2 lg:col-span-3">{t('settings.rules')}</h2>
        <Input
          label={t('settings.start')}
          name="start"
          type="time"
          defaultValue={hhmm(s.startMinuteOfDay)}
          required
        />
        <Input
          label={t('settings.duration')}
          name="duration"
          type="number"
          min={5}
          max={720}
          defaultValue={s.durationMinutes}
          required
        />
        <Input
          label={t('settings.fee', { currency: s.currency })}
          name="fee"
          inputMode="decimal"
          defaultValue={centsToStr(s.entryFeeMinor)}
          required
        />
        <Input
          label={t('settings.balance', { currency: s.currency })}
          name="balance"
          inputMode="decimal"
          defaultValue={centsToStr(s.startBalanceMinor)}
          required
        />
        <Input
          label={t('settings.leverage')}
          name="leverage"
          type="number"
          min={1}
          max={500}
          defaultValue={s.leverage}
          required
        />
        <Input
          label={t('settings.drawdown')}
          name="drawdown"
          type="number"
          step="0.01"
          min={0.01}
          max={99.99}
          defaultValue={s.maxDrawdownBps / 100}
          required
        />
        <Input
          label={t('settings.min')}
          name="min"
          type="number"
          min={3}
          defaultValue={s.minParticipants}
          required
        />
        <Input
          label={t('settings.pool')}
          name="pool"
          type="number"
          step="0.01"
          min={0}
          max={100}
          defaultValue={s.prizePoolBps / 100}
          required
        />
        <Input
          label={t('settings.split')}
          name="split"
          defaultValue={s.prizeSplitBps.map((x) => x / 100).join(' / ')}
          hint={t('settings.splitHint')}
          required
        />
      </Card>
      <p className="text-sm text-muted">{t('settings.note')}</p>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={save.isPending}>
          {t('settings.save')}
        </Button>
        {msg && (
          <p
            role={msg.ok ? 'status' : 'alert'}
            className={cn('text-sm', msg.ok ? 'text-profit' : 'text-loss')}
          >
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}

export function CompeteAdminSettingsPage() {
  const { t } = useTranslation('competeAdmin');
  const q = useAdminSettings();
  const operator = useCompeteAdmin((s) => s.operator);
  return (
    <>
      <PageTitle title={t('settings.title')} sub={t('settings.sub')} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Failed onRetry={() => void q.refetch()} />
      ) : (
        <SettingsForm key={operator ?? 'own'} s={q.data} />
      )}
    </>
  );
}

// ================================================================ audit

export function CompeteAdminAuditPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const q = useAdminAudit();
  return (
    <>
      <PageTitle
        title={t('audit.title')}
        sub={t('audit.sub')}
        actions={q.data && <StatusBadge status={q.data.chainIntact ? 'ACTIVE' : 'SUSPENDED'} />}
      />
      {q.data && (
        <p role="status" className="text-sm">
          {q.data.chainIntact ? t('audit.intact') : t('audit.broken')}
        </p>
      )}
      <Card padding="none">
        {q.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : q.isError ? (
          <Failed onRetry={() => void q.refetch()} />
        ) : (
          <Table
            label={t('audit.title')}
            minWidth={720}
            head={
              <>
                <Th>{t('audit.time')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('audit.actor')}</Th>
                <Th>{t('audit.entity')}</Th>
              </>
            }
          >
            {q.data.items.map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{date(r.ts, f.locale)}</Td>
                <Td>
                  <code className="font-mono text-xs">{r.action}</code>
                </Td>
                <Td>{t(`audit.actors.${r.actorType}`, { defaultValue: r.actorType })}</Td>
                <Td className="text-xs text-muted">
                  {r.entityType} · {r.entityId.slice(0, 8)}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

// ================================================================ operators (superadmin)

export function CompeteAdminOperatorsPage() {
  const { t } = useTranslation('competeAdmin');
  const f = useFormat();
  const toMessage = useAdminError();
  const staff = useCompeteAdmin((s) => s.staff);
  const q = useOperators(staff?.role === 'SUPERADMIN');
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useAdminMutation((body: { slug: string; name: string; ownerEmail: string }) =>
    adminCall(() => adminClient.POST('/api/v1/compete/admin/operators', { body })),
  );
  const status = useAdminMutation((v: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
    adminCall(() =>
      adminClient.POST('/api/v1/compete/admin/operators/{id}/status', {
        params: { path: { id: v.id } },
        body: { status: v.status },
      }),
    ),
  );
  const reinvite = useAdminMutation((id: string) =>
    adminCall(() =>
      adminClient.POST('/api/v1/compete/admin/operators/{id}/owner/reinvite', {
        params: { path: { id } },
      }),
    ),
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    try {
      const r = await create.mutateAsync({
        slug: String(fd.get('slug')),
        name: String(fd.get('name')),
        ownerEmail: String(fd.get('owner')),
      });
      setLink(r.setupUrl);
      form.reset();
    } catch (err) {
      setError(toMessage(err));
    }
  };
  return (
    <>
      <PageTitle title={t('operators.title')} sub={t('operators.sub')} />
      <Card padding="lg">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Input label={t('operators.name')} name="name" required minLength={2} />
          <Input
            label={t('operators.slug')}
            name="slug"
            required
            pattern="[a-z0-9-]{3,40}"
            hint={t('operators.slugHint')}
          />
          <Input label={t('operators.owner')} name="owner" type="email" required />
          <Button type="submit" disabled={create.isPending}>
            {t('operators.create')}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-loss">
            {error}
          </p>
        )}
        {link && (
          <div
            role="status"
            className="mt-4 rounded-[12px] border border-border bg-card-muted p-3 text-sm"
          >
            <p className="font-semibold">{t('operators.linkTitle')}</p>
            <p className="mt-1 text-muted">{t('operators.linkBody')}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void navigator.clipboard?.writeText(link)}
                aria-label={t('operators.copy')}
              >
                <Copy aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      <Card padding="none">
        {q.isPending ? (
          <div className="p-5">
            <Loading />
          </div>
        ) : q.isError ? (
          <Failed onRetry={() => void q.refetch()} />
        ) : (
          <Table
            label={t('operators.title')}
            minWidth={820}
            head={
              <>
                <Th>{t('operators.name')}</Th>
                <Th>{t('operators.owner')}</Th>
                <Th>{t('rounds.status')}</Th>
                <Th right>{t('overview.players')}</Th>
                <Th>{t('operators.created')}</Th>
                <Th />
              </>
            }
          >
            {q.data.map((o) => (
              <Tr key={o.id}>
                <Td>
                  <span className="font-medium">{o.name}</span>
                  <span className="block text-xs text-muted">
                    {o.slug}
                    {o.domain ? ` · ${o.domain}` : ''}
                  </span>
                </Td>
                <Td>
                  {o.ownerEmail ?? '—'}
                  <span className="block text-xs text-muted">
                    {o.ownerTwoFactor ? t('operators.twoFactorOn') : t('operators.twoFactorOff')}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={o.status} />
                </Td>
                <Td right>{o.players}</Td>
                <Td>{new Date(o.createdAt).toLocaleDateString(f.locale)}</Td>
                <Td right>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!o.ownerEmail}
                      onClick={() =>
                        void reinvite.mutateAsync(o.id).then((r) => setLink(r.setupUrl))
                      }
                    >
                      {t('operators.reinvite')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        status.mutate({
                          id: o.id,
                          status: o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        })
                      }
                    >
                      {o.status === 'ACTIVE' ? t('operators.suspend') : t('operators.activate')}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
