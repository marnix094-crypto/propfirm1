import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader, Panel } from '@/components/ui/panel';
import { StatTile } from '@/components/ui/stat';
import { useLeaderboard } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';
import { ProfileCard } from './profile-card';
import { RankingTable } from './ranking-table';

/** Leaderboard: active funded accounts of traders who opted in, ranked by return. */
export function LeaderboardPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const lb = useLeaderboard();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('app.nav.leaderboard')} subtitle={t('ranking.subtitle')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={t('ranking.top')}>
          {lb.isPending ? (
            <Skeleton className="m-5 h-40" />
          ) : lb.isError ? (
            <ErrorState
              title={t('errors.generic')}
              retryLabel={t('common.retry')}
              onRetry={() => void lb.refetch()}
            />
          ) : lb.data.rows.length === 0 ? (
            <EmptyState title={t('ranking.empty')} body={t('ranking.emptyBody')} />
          ) : (
            <RankingTable rows={lb.data.rows} testId="leaderboard" />
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          {lb.data?.you ? (
            <StatTile
              label={lb.data.youArePublic ? t('ranking.yourRank') : t('ranking.yourPrivateRank')}
              value={`#${lb.data.you.rank}`}
              sub={`${lb.data.you.returnBps > 0 ? '+' : ''}${f.bps(lb.data.you.returnBps)}`}
            />
          ) : (
            lb.isSuccess && (
              <StatTile label={t('ranking.yourRank')} value="—" sub={t('ranking.noFunded')} />
            )
          )}
          <ProfileCard />
        </div>
      </div>
      <p className="text-xs text-muted">{t('ranking.disclaimer')}</p>
    </div>
  );
}
