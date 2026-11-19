import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock, Gauge, ShieldAlert, Trophy, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { Countdown } from './countdown';
import { useCompeteOperator, useCurrentRound, useLeaderboard, useRecentRounds } from './hooks';
import { Leaderboard } from './leaderboard';
import { PlayersProgress, PrizePodium, StatusPill } from './arena-ui';
import { useCompeteSession } from './session';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Live round panel of the hero: countdown, pot, players vs. minimum, prizes, join. */
function RoundPanel() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const { lang } = useParams();
  const authed = useCompeteSession((s) => s.status === 'authenticated');
  const q = useCurrentRound();
  if (q.isPending) return <Skeleton className="h-[420px] w-full rounded-card" />;
  if (q.isError)
    return (
      <ErrorState
        title={t('errors.load')}
        retryLabel={t('retry')}
        onRetry={() => void q.refetch()}
      />
    );
  const r = q.data;
  const live = r.status === 'LIVE';
  return (
    <div className="glow-card-strong glass relative overflow-hidden rounded-[24px] border p-6 sm:p-7">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent)] opacity-25 blur-2xl"
      />
      <div className="relative flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">{t('round.today')}</h2>
        <StatusPill status={r.status} />
      </div>
      <p className="relative mt-5 text-xs font-medium text-muted">
        {live ? t('round.endsIn') : t('round.startsIn')}
      </p>
      <Countdown to={live ? r.endsAt : r.startsAt} className="relative mt-2" />
      <div className="relative mt-6 grid grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-medium text-muted">{t('round.pot')}</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {f.money(r.potMinor, r.currency)}
          </p>
        </div>
        <PlayersProgress round={r} />
      </div>
      <div className="relative mt-6">
        <PrizePodium
          amounts={r.prizesMinor}
          splitBps={r.prizeSplitBps}
          currency={r.currency}
          compact
        />
      </div>
      <Button size="lg" fullWidth className="relative mt-6" asChild>
        <Link to={authed ? `/${lang}/compete/app` : `/${lang}/compete/register`}>
          {r.myEntry
            ? t('cta.toDashboard')
            : t('cta.join', { fee: f.moneyCompact(r.entryFeeMinor, r.currency) })}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <p className="relative mt-3 text-center text-xs text-muted">{t('arena.oneEntry')}</p>
    </div>
  );
}

/** Public live ranking on the home page while a round is running. */
function LiveNow() {
  const { t } = useTranslation('compete');
  const round = useCurrentRound();
  const lb = useLeaderboard(round.data);
  if (round.data?.status !== 'LIVE') return null;
  return (
    <section className="py-12" aria-label={t('leaderboard.title')}>
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Leaderboard
          data={lb.data}
          currency={round.data.currency}
          loading={lb.isPending}
          limit={8}
        />
      </div>
    </section>
  );
}

function Prizes() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const op = useCompeteOperator();
  const round = useCurrentRound();
  const reduce = useReducedMotion();
  if (!op.data) return null;
  const pool = op.data.prizePoolBps;
  // Example amounts at the minimum number of participants (labelled as example).
  const fee = BigInt(op.data.entryFeeMinor);
  const examplePot = fee * BigInt(op.data.minParticipants);
  const order = [1, 0, 2];
  return (
    <section id="prizes" className="scroll-mt-24 py-20" aria-labelledby="prizes-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
          {t('prizes.eyebrow')}
        </p>
        <h2
          id="prizes-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {t('prizes.title', { pool: f.bps(pool) })}
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          {t('prizes.body', { rest: f.bps(10_000 - pool) })}
        </p>
        <div className="mt-12 grid items-end gap-4 sm:grid-cols-3">
          {order.map((i, k) => {
            const split = op.data.prizeSplitBps[i] ?? 0;
            const share = (pool * split) / 10_000;
            const amount = (examplePot * BigInt(pool) * BigInt(split)) / 100_000_000n;
            return (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, ease: EASE, delay: k * 0.1 }}
                className={cn(i === 0 ? 'sm:order-2' : i === 1 ? 'sm:order-1' : 'sm:order-3')}
              >
                <Card
                  padding="lg"
                  className={cn(
                    'glow-card text-center',
                    i === 0 && 'glow-card-strong sm:pt-10 sm:pb-16',
                    i === 1 && 'sm:pb-10',
                  )}
                >
                  <Trophy
                    className={cn('mx-auto size-8', i === 0 ? 'text-accent' : 'text-muted')}
                    aria-hidden="true"
                  />
                  <p className="mt-3 text-sm font-semibold text-muted">
                    {t(`prizes.place${i + 1}`)}
                  </p>
                  <p className="mt-1 font-display text-4xl font-bold">{f.bps(split, 0)}</p>
                  <p className="mt-1 text-sm text-muted">
                    {t('prizes.ofPool', { share: f.bps(share) })}
                  </p>
                  <p className="mt-4 text-sm">
                    {t('prizes.example', {
                      amount: f.money(amount, op.data.currency),
                      n: op.data.minParticipants,
                    })}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
        {round.data && round.data.participants > 0 && (
          <p className="mt-6 text-center text-sm text-muted">
            {t('prizes.current', {
              pot: f.money(round.data.potMinor, round.data.currency),
              n: round.data.participants,
            })}
          </p>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const op = useCompeteOperator();
  const steps = [
    { icon: Wallet, k: 'step1' },
    { icon: Clock, k: 'step2' },
    { icon: Gauge, k: 'step3' },
    { icon: Trophy, k: 'step4' },
  ] as const;
  const vars = op.data
    ? {
        fee: f.moneyCompact(op.data.entryFeeMinor, op.data.currency),
        balance: f.moneyWhole(op.data.startBalanceMinor, op.data.currency),
        leverage: f.leverage(op.data.leverage),
        minutes: op.data.durationMinutes,
      }
    : {};
  return (
    <section
      id="how"
      className="relative scroll-mt-24 overflow-hidden border-y border-border py-20"
      aria-labelledby="how-title"
    >
      <div
        aria-hidden="true"
        className="dot-field pointer-events-none absolute inset-0 opacity-50"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
          {t('how.eyebrow')}
        </p>
        <h2
          id="how-title"
          className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {t('how.title')}
        </h2>
        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <span
            aria-hidden="true"
            className="absolute top-[42px] right-[12%] left-[12%] hidden h-px bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] opacity-60 lg:block"
          />
          {steps.map((s, i) => (
            <li key={s.k} className="relative">
              <Card padding="lg" className="glow-card h-full">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-primary text-[var(--btn-primary-fg)]">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-display text-sm font-bold text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t(`how.${s.k}.title`, vars)}</h3>
                <p className="mt-2 text-sm text-muted">{t(`how.${s.k}.body`, vars)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Rules() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const op = useCompeteOperator();
  if (!op.data) return null;
  const d = op.data;
  const floor = (BigInt(d.startBalanceMinor) * BigInt(10_000 - d.maxDrawdownBps)) / 10_000n;
  const rules = [
    {
      icon: ShieldAlert,
      text: t('rules.drawdown', {
        pct: f.bps(d.maxDrawdownBps),
        floor: f.moneyWhole(floor, d.currency),
      }),
    },
    { icon: Users, text: t('rules.minimum', { n: d.minParticipants }) },
    { icon: Trophy, text: t('rules.oneEntry') },
    { icon: Gauge, text: t('rules.orders', { leverage: f.leverage(d.leverage) }) },
    { icon: Clock, text: t('rules.ranking') },
  ];
  return (
    <section id="rules" className="scroll-mt-24 py-20" aria-labelledby="rules-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
            {t('rules.eyebrow')}
          </p>
          <h2 id="rules-title" className="mt-3 font-display text-3xl font-bold tracking-tight">
            {t('rules.title')}
          </h2>
          <p className="mt-4 text-muted">{t('rules.body')}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {rules.map((r) => (
            <li key={r.text} className="glow-card flex gap-4 rounded-[16px] p-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary-tint/50">
                <r.icon className="size-4 text-accent" aria-hidden="true" />
              </span>
              <span className="text-sm">{r.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Results() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const q = useRecentRounds();
  return (
    <section id="results" className="scroll-mt-24 pb-24" aria-labelledby="results-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 id="results-title" className="font-display text-2xl font-bold tracking-tight">
          {t('results.title')}
        </h2>
        {q.isPending ? (
          <Skeleton className="mt-6 h-32 w-full" />
        ) : q.isError ? (
          <div className="mt-6">
            <ErrorState
              title={t('errors.load')}
              retryLabel={t('retry')}
              onRetry={() => void q.refetch()}
            />
          </div>
        ) : q.data.length === 0 ? (
          <p className="mt-6 rounded-[16px] border border-dashed border-border p-6 text-center text-sm text-muted">
            {t('results.empty')}
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-[16px] border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('results.date')}</th>
                  <th className="px-4 py-3 font-semibold">{t('results.status')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('round.participants')}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t('round.pot')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      {new Date(r.startsAt).toLocaleString(f.locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">{t(`status.${r.status}`)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.participants}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {f.money(r.potMinor, r.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** Home of the example operator's daily trading competition (player-facing). */
export function CompeteHomePage() {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const op = useCompeteOperator();
  const reduce = useReducedMotion();
  const name = op.data?.name ?? 'Arena';
  const facts = op.data
    ? [
        { k: 'fee', v: f.moneyCompact(op.data.entryFeeMinor, op.data.currency) },
        { k: 'balance', v: f.moneyWhole(op.data.startBalanceMinor, op.data.currency) },
        { k: 'leverage', v: f.leverage(op.data.leverage) },
        { k: 'duration', v: t('facts.minutes', { n: op.data.durationMinutes }) },
      ]
    : [];
  return (
    <>
      <title>{t('seo.title', { firm: name })}</title>
      <meta name="description" content={t('seo.description', { firm: name })} />
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="dot-field absolute inset-0 opacity-70" />
          <div className="light-beams absolute -top-24 left-1/2 h-[700px] w-[1400px] -translate-x-1/2 opacity-80" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_0%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent)]" />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t('hero.eyebrow')}
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] font-bold tracking-tight sm:text-6xl lg:text-7xl">
              {t('hero.title1')} <span className="text-accent">{t('hero.title2')}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              {op.data &&
                t('hero.body', {
                  fee: f.moneyCompact(op.data.entryFeeMinor, op.data.currency),
                  balance: f.moneyWhole(op.data.startBalanceMinor, op.data.currency),
                  pool: f.bps(op.data.prizePoolBps),
                })}
            </p>
            <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {facts.map((x) => (
                <div key={x.k} className="glow-card glass rounded-[16px] p-3">
                  <dt className="text-xs text-muted">{t(`facts.${x.k}`)}</dt>
                  <dd className="mt-1 font-display text-lg font-bold tabular-nums">{x.v}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
          >
            <RoundPanel />
          </motion.div>
        </div>
      </section>
      <LiveNow />
      <HowItWorks />
      <Prizes />
      <Rules />
      <Results />
    </>
  );
}
