import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  ShieldAlert,
  Trophy,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { Leaderboard } from './leaderboard';
import { CompeteTerminal, EntryStats } from './terminal';
import { competeRealtime } from './realtime';
import { useCompeteSession } from './session';
import { useCurrentRound, useEntry, useHistory, useJoinRound, useLeaderboard } from './hooks';
import { useCompeteError } from './auth-pages';
import {
  Clock,
  Journey,
  PlayersProgress,
  PrizePodium,
  ReturnText,
  RoundTimeBar,
  StatusPill,
  type JourneyStep,
} from './arena-ui';
import type { CompeteRound } from './api';

/** Always-visible round bar: status, time left, pot, players and the three prizes. */
function RoundBar({ round }: { round: CompeteRound }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const live = round.status === 'LIVE';
  return (
    <Card padding="none" className="glow-card overflow-hidden">
      <div className="grid gap-5 p-5 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={round.status} />
            <span className="text-xs text-muted">
              {new Date(round.startsAt).toLocaleString(f.locale, {
                weekday: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted">
            {live ? t('round.endsIn') : t('round.startsIn')}
          </p>
          <Clock to={live ? round.endsAt : round.startsAt} className="text-4xl sm:text-5xl" />
        </div>
        <div className="grid grid-cols-2 gap-5 md:max-w-sm">
          <div>
            <p className="text-xs font-medium text-muted">{t('round.pot')}</p>
            <p className="font-display text-2xl font-bold tabular-nums" data-testid="compete-pot">
              {f.money(round.potMinor, round.currency)}
            </p>
          </div>
          <PlayersProgress round={round} />
        </div>
        <div className="md:w-[300px]">
          <PrizePodium
            amounts={round.prizesMinor}
            splitBps={round.prizeSplitBps}
            currency={round.currency}
            compact
          />
        </div>
      </div>
      <RoundTimeBar round={round} />
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

/** What the player gets for the entry fee. */
function Included({ round }: { round: CompeteRound }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const floor = (BigInt(round.startBalanceMinor) * BigInt(10_000 - round.maxDrawdownBps)) / 10_000n;
  const items = [
    {
      icon: Wallet,
      text: t('arena.inc.balance', {
        balance: f.moneyWhole(round.startBalanceMinor, round.currency),
      }),
    },
    { icon: Gauge, text: t('arena.inc.leverage', { leverage: f.leverage(round.leverage) }) },
    {
      icon: ShieldAlert,
      text: t('arena.inc.floor', { floor: f.moneyWhole(floor, round.currency) }),
    },
    { icon: Trophy, text: t('arena.inc.prizes') },
  ];
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((x) => (
        <li
          key={x.text}
          className="flex items-start gap-3 rounded-[14px] border border-border bg-card-muted/50 p-3 text-sm"
        >
          <x.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          {x.text}
        </li>
      ))}
    </ul>
  );
}

/** Join / pay / waiting state before the round goes live. */
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

  const step: JourneyStep =
    !e || e.status === 'PAYMENT_FAILED' || e.status === 'PENDING_PAYMENT' ? 'pay' : 'start';

  let body;
  if (!e || e.status === 'PAYMENT_FAILED') {
    body = (
      <>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {t('entry.joinTitle', { fee })}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {e?.status === 'PAYMENT_FAILED' ? t('entry.paymentFailed') : t('entry.joinBody')}
          </p>
        </div>
        <Included round={round} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" onClick={() => void onJoin()} disabled={join.isPending}>
            {t('cta.join', { fee })}
            <ArrowRight aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted">{t('arena.oneEntry')}</span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-loss">
            {error}
          </p>
        )}
      </>
    );
  } else if (e.status === 'PENDING_PAYMENT') {
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">{t('entry.pending')}</h2>
          <p className="mt-1 text-sm text-muted">{t('arena.pendingBody', { fee })}</p>
        </div>
        <Button size="lg" asChild>
          <Link to={`/${lang}/compete/pay/${e.id}`}>{t('entry.completePayment')}</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-6 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 className="font-display text-2xl font-bold" data-testid="compete-entered">
              {t('entry.entered')}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t('entry.enteredBody', {
                balance: f.moneyWhole(round.startBalanceMinor, round.currency),
                n: round.minParticipants,
              })}
            </p>
          </div>
        </div>
        <Included round={round} />
        {import.meta.env.VITE_DEMO_MODE === 'true' && round.status === 'OPEN' && (
          <div>
            <StartNowDemo />
          </div>
        )}
      </>
    );
  }

  return (
    <Card padding="lg" className="flex flex-col gap-6">
      <Journey current={step} />
      {body}
    </Card>
  );
}

/** Live round but the player is not (or no longer) trading. */
function SpectatorPanel({ round }: { round: CompeteRound }) {
  const { t } = useTranslation('compete');
  const breached = round.myEntry?.status === 'BREACHED';
  return (
    <Card padding="lg" className="flex items-start gap-3">
      {breached ? (
        <XCircle className="mt-0.5 size-5 shrink-0 text-loss" aria-hidden="true" />
      ) : (
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
      )}
      <div>
        <p className="font-semibold">
          {breached ? t('entry.breachedTitle') : t('entry.notInRound')}
        </p>
        <p className="mt-1 text-sm text-muted">{t('entry.nextRound')}</p>
      </div>
    </Card>
  );
}

function History() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const q = useHistory();
  return (
    <section aria-labelledby="history-title" id="history" className="scroll-mt-24">
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
        <Card padding="none" className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card-muted/60 text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-semibold">{t('results.date')}</th>
                <th className="py-2.5 font-semibold">{t('results.status')}</th>
                <th className="py-2.5 text-right font-semibold">{t('history.rank')}</th>
                <th className="py-2.5 text-right font-semibold">{t('leaderboard.return')}</th>
                <th className="px-5 py-2.5 text-right font-semibold">{t('leaderboard.prize')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map(({ round, entry }) => {
                const won = entry.prizeMinor && entry.prizeMinor !== '0';
                return (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium whitespace-nowrap">
                      {new Date(round.startsAt).toLocaleDateString(f.locale, {
                        dateStyle: 'medium',
                      })}
                    </td>
                    <td className="py-3 text-muted">{t(`entryStatus.${entry.status}`)}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">
                      {entry.rank ? `#${entry.rank}` : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <ReturnText bps={entry.returnBps} />
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      <span className={cn('inline-flex items-center gap-1', won && 'text-accent')}>
                        {won && <Trophy className="size-4" aria-hidden="true" />}
                        {won ? f.money(entry.prizeMinor!, round.currency) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

/** Player dashboard (D107): round bar, journey to the start, live terminal + leaderboard, history. */
export function CompeteDashboardPage() {
  const { t } = useTranslation('compete');
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
  const myRank = lb.data?.me?.rank ?? lb.data?.rows.find((x) => x.isMe)?.rank;

  useEffect(() => (r ? competeRealtime.watchRound(qc, r.id) : undefined), [qc, r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => competeRealtime.onStatus(setConnected), []);

  const trading = live && entry.data?.status === 'ACTIVE';

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6">
      <title>{t('dashboard.docTitle')}</title>
      <div>
        <p className="text-sm text-muted">
          {t('dashboard.hello', { name: player?.nickname ?? '' })}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {t('dashboard.title')}
        </h1>
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
        <Skeleton className="h-40 w-full rounded-card" />
      ) : round.isError || !r ? (
        <ErrorState
          title={t('errors.load')}
          retryLabel={t('retry')}
          onRetry={() => void round.refetch()}
        />
      ) : (
        <>
          <RoundBar round={r} />
          {trading && entry.data ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex min-w-0 flex-col gap-5">
                <EntryStats
                  entry={entry.data}
                  currency={r.currency}
                  rank={myRank}
                  participants={lb.data?.participants}
                />
                <CompeteTerminal entry={entry.data} currency={r.currency} leverage={r.leverage} />
              </div>
              <div className="xl:sticky xl:top-24 xl:self-start">
                <Leaderboard data={lb.data} currency={r.currency} loading={lb.isPending} />
              </div>
            </div>
          ) : live ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col gap-5">
                <SpectatorPanel round={r} />
                {entry.data && (
                  <EntryStats
                    entry={entry.data}
                    currency={r.currency}
                    rank={myRank}
                    participants={lb.data?.participants}
                  />
                )}
              </div>
              <Leaderboard data={lb.data} currency={r.currency} loading={lb.isPending} />
            </div>
          ) : (
            <EntryPanel round={r} />
          )}
        </>
      )}
      <History />
    </div>
  );
}
