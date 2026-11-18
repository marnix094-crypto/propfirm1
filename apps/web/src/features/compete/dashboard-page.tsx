import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, LogOut, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { Countdown } from './countdown';
import { Leaderboard } from './leaderboard';
import { CompeteTerminal, EntryStats } from './terminal';
import { competeRealtime } from './realtime';
import { useCompeteSession } from './session';
import { useCurrentRound, useEntry, useHistory, useJoinRound, useLeaderboard } from './hooks';
import { useCompeteError } from './auth-pages';
import type { CompeteRound } from './api';

function RoundHeader({ round }: { round: CompeteRound }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const live = round.status === 'LIVE';
  return (
    <Card padding="lg" className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant={live ? 'success' : 'primary'}>{t(`status.${round.status}`)}</Badge>
          <span className="text-sm text-muted">
            {new Date(round.startsAt).toLocaleString(f.locale, {
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="mt-4 text-sm text-muted">{live ? t('round.endsIn') : t('round.startsIn')}</p>
        <Countdown to={live ? round.endsAt : round.startsAt} className="mt-2" />
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-5 lg:justify-self-end">
        <div>
          <dt className="text-xs text-muted">{t('round.pot')}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums" data-testid="compete-pot">
            {f.money(round.potMinor, round.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('round.participants')}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">
            {round.participants}
            <span className="ml-1 text-sm font-medium text-muted">
              {t('round.minimum', { n: round.minParticipants })}
            </span>
          </dd>
        </div>
        {round.prizesMinor.map((p, i) => (
          <div key={i}>
            <dt className="text-xs text-muted">{t(`prizes.place${i + 1}`)}</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">
              {f.money(p, round.currency)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Join call-to-action / entry state before and between rounds. */
function EntryPanel({ round }: { round: CompeteRound }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const { lang } = useParams();
  const navigate = useNavigate();
  const join = useJoinRound();
  const toMessage = useCompeteError();
  const [error, setError] = useState<string | null>(null);
  const e = round.myEntry;
  const fee = f.moneyCompact(round.entryFeeMinor, round.currency);

  const onJoin = async () => {
    setError(null);
    try {
      const r = await join.mutateAsync(round.id);
      navigate(`/${lang}/compete/pay/${r.entry.id}`);
    } catch (err) {
      setError(toMessage(err));
    }
  };

  if (round.status === 'LIVE' && (!e || e.status !== 'ACTIVE'))
    return (
      <Card padding="lg">
        <p className="font-semibold">
          {e?.status === 'BREACHED' ? t('entry.breachedTitle') : t('entry.notInRound')}
        </p>
        <p className="mt-1 text-sm text-muted">{t('entry.nextRound')}</p>
      </Card>
    );

  if (!e || e.status === 'PAYMENT_FAILED')
    return (
      <Card
        padding="lg"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="font-display text-xl font-bold">{t('entry.joinTitle', { fee })}</h2>
          <p className="mt-1 text-sm text-muted">
            {e?.status === 'PAYMENT_FAILED' ? t('entry.paymentFailed') : t('entry.joinBody')}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-loss">
              {error}
            </p>
          )}
        </div>
        <Button size="lg" onClick={() => void onJoin()} disabled={join.isPending}>
          {t('cta.join', { fee })}
        </Button>
      </Card>
    );

  if (e.status === 'PENDING_PAYMENT')
    return (
      <Card
        padding="lg"
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="font-semibold">{t('entry.pending')}</p>
        <Button asChild>
          <Link to={`/${lang}/compete/pay/${e.id}`}>{t('entry.completePayment')}</Link>
        </Button>
      </Card>
    );

  return (
    <Card padding="lg" className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
      <div>
        <p className="font-semibold" data-testid="compete-entered">
          {t('entry.entered')}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t('entry.enteredBody', {
            balance: f.moneyWhole(round.startBalanceMinor, round.currency),
            n: round.minParticipants,
          })}
        </p>
        {import.meta.env.VITE_DEMO_MODE === 'true' && round.status === 'OPEN' && <StartNowDemo />}
      </div>
    </Card>
  );
}

/** Preview only: skip the wait until the start time (in-browser demo backend). */
function StartNowDemo() {
  const { t } = useTranslation('compete');
  const qc = useQueryClient();
  return (
    <Button
      size="sm"
      variant="secondary"
      className="mt-3"
      onClick={() =>
        void fetch('/api/v1/compete/dev/start-now', { method: 'POST' }).then(() =>
          qc.invalidateQueries({ queryKey: ['compete'] }),
        )
      }
    >
      {t('entry.startNowDemo')}
    </Button>
  );
}

function History() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const q = useHistory();
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="font-display text-xl font-bold">
        {t('history.title')}
      </h2>
      {q.isPending ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : q.isError ? (
        <ErrorState
          title={t('errors.load')}
          retryLabel={t('retry')}
          onRetry={() => void q.refetch()}
        />
      ) : q.data.length === 0 ? (
        <p className="mt-4 rounded-[16px] border border-dashed border-border p-6 text-center text-sm text-muted">
          {t('history.empty')}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {q.data.map(({ round, entry }) => {
            const ret = Number(entry.returnBps);
            return (
              <li key={entry.id}>
                <Card padding="md" className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {new Date(round.startsAt).toLocaleDateString(f.locale, {
                        dateStyle: 'medium',
                      })}
                    </p>
                    <p className="text-sm text-muted">{t(`entryStatus.${entry.status}`)}</p>
                  </div>
                  <div className="flex gap-6 text-sm tabular-nums">
                    <span>
                      <span className="text-muted">{t('history.rank')} </span>
                      <span className="font-semibold">{entry.rank ?? '—'}</span>
                    </span>
                    <span className={ret > 0 ? 'text-profit' : ret < 0 ? 'text-loss' : ''}>
                      {(ret > 0 ? '+' : '') + f.bps(ret)}
                    </span>
                    <span className="flex items-center gap-1 font-semibold">
                      {entry.prizeMinor && entry.prizeMinor !== '0' && (
                        <Trophy className="size-4 text-accent" aria-hidden="true" />
                      )}
                      {entry.prizeMinor && entry.prizeMinor !== '0'
                        ? f.money(entry.prizeMinor, round.currency)
                        : '—'}
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Player dashboard: round status, join / pay, live terminal + leaderboard, history. */
export function CompeteDashboardPage() {
  const { t } = useTranslation('compete');
  const { lang } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const player = useCompeteSession((s) => s.player);
  const round = useCurrentRound();
  const r = round.data;
  const live = r?.status === 'LIVE';
  const entry = useEntry(
    r?.myEntry?.status === 'ACTIVE' || r?.myEntry?.status === 'BREACHED' ? r.myEntry.id : undefined,
    live,
  );
  const lb = useLeaderboard(r);
  const [connected, setConnected] = useState(true);

  useEffect(() => (r ? competeRealtime.watchRound(qc, r.id) : undefined), [qc, r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => competeRealtime.onStatus(setConnected), []);

  const logout = async () => {
    competeRealtime.disconnect();
    await useCompeteSession.getState().logout();
    qc.removeQueries({ queryKey: ['compete'] });
    navigate(`/${lang}/compete`);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <title>{t('dashboard.docTitle')}</title>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {t('dashboard.hello', { name: player?.nickname ?? '' })}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void logout()}>
          <LogOut aria-hidden="true" />
          {t('nav.logout')}
        </Button>
      </div>
      {live && !connected && import.meta.env.VITE_DEMO_MODE !== 'true' && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-sm"
        >
          <AlertTriangle className="size-4 text-warn" aria-hidden="true" />
          {t('dashboard.reconnecting')}
        </p>
      )}
      {round.isPending ? (
        <Skeleton className="h-48 w-full rounded-card" />
      ) : round.isError || !r ? (
        <ErrorState
          title={t('errors.load')}
          retryLabel={t('retry')}
          onRetry={() => void round.refetch()}
        />
      ) : (
        <>
          <RoundHeader round={r} />
          {live && entry.data?.status === 'ACTIVE' ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-4">
                <EntryStats entry={entry.data} currency={r.currency} />
                <CompeteTerminal entry={entry.data} currency={r.currency} leverage={r.leverage} />
              </div>
              <div>
                <Leaderboard data={lb.data} currency={r.currency} loading={lb.isPending} />
              </div>
            </div>
          ) : (
            <>
              <EntryPanel round={r} />
              {live && entry.data && <EntryStats entry={entry.data} currency={r.currency} />}
              {live && <Leaderboard data={lb.data} currency={r.currency} loading={lb.isPending} />}
            </>
          )}
        </>
      )}
      <History />
    </div>
  );
}
