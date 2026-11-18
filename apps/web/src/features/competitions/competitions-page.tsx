import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { toast } from '@/components/ui/toaster';
import { useCompetitions, useJoinCompetition, type Competition } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';
import { errorMessage } from '@/lib/errors';
import { useTradingUi } from '@/stores/trading';
import { ProfileCard } from '../leaderboard/profile-card';
import { RankingTable } from '../leaderboard/ranking-table';

function CompetitionCard({ c }: { c: Competition }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const join = useJoinCompetition();
  const setActive = useTradingUi((s) => s.setActiveAccount);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(f.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  const open = (accountId: string) => {
    setActive(accountId);
    void navigate(`/${lang}/app/trade`);
  };
  return (
    <Panel
      title={c.name}
      data-testid="competition"
      actions={
        <Badge variant={c.status === 'RUNNING' ? 'success' : 'neutral'}>
          {t(`competitions.status.${c.status}`)}
        </Badge>
      }
    >
      <dl className="grid grid-cols-2 gap-4 border-b border-border p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">{t('competitions.starts')}</dt>
          <dd className="mt-0.5 font-medium">{date(c.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('competitions.ends')}</dt>
          <dd className="mt-0.5 font-medium">{date(c.endsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('competitions.balance')}</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {f.moneyWhole(c.startingBalanceMinor, 'USD')} · {f.leverage(c.maxLeverage)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('competitions.prize')}</dt>
          <dd className="mt-0.5 font-medium">{c.prize ?? t('competitions.noPrize')}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-muted">
          {t('competitions.entrants', { count: c.entrants })}
          {c.you && ` · ${t('competitions.yourRank', { rank: c.you.rank })}`}
        </p>
        {c.yourAccountId ? (
          <Button size="sm" onClick={() => open(c.yourAccountId!)}>
            {t('competitions.trade')}
          </Button>
        ) : (
          c.status !== 'ENDED' && (
            <Button
              size="sm"
              disabled={join.isPending}
              onClick={() =>
                join.mutate(c.id, {
                  onSuccess: (r) => {
                    toast({ kind: 'success', title: t('competitions.joined') });
                    if (r.yourAccountId) setActive(r.yourAccountId);
                  },
                  onError: (e) => toast({ kind: 'error', title: errorMessage(t, e) }),
                })
              }
            >
              {t('competitions.join')}
            </Button>
          )
        )}
      </div>
      {c.standings.length > 0 ? (
        <div className="border-t border-border">
          <RankingTable rows={c.standings} testId="competition-standings" />
        </div>
      ) : (
        <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">
          {t('competitions.noEntrants')}
        </p>
      )}
    </Panel>
  );
}

/** Competitions: same simulated balance for everyone, ranked by return. */
export function CompetitionsPage() {
  const { t } = useTranslation();
  const list = useCompetitions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.competitions')} subtitle={t('competitions.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {list.isPending ? (
            <Skeleton className="h-72" />
          ) : list.isError ? (
            <ErrorState
              title={t('errors.generic')}
              retryLabel={t('common.retry')}
              onRetry={() => void list.refetch()}
            />
          ) : list.data.items.length === 0 ? (
            <EmptyState title={t('competitions.empty')} />
          ) : (
            list.data.items.map((c) => <CompetitionCard key={c.id} c={c} />)
          )}
        </div>
        <div className="flex flex-col gap-4">
          <ProfileCard showOptIn={false} />
          <Panel title={t('competitions.rulesTitle')} bodyClassName="p-5">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
              {(t('competitions.rules', { returnObjects: true }) as string[]).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
