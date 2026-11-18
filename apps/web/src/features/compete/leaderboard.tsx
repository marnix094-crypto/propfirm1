import { useTranslation } from 'react-i18next';
import { Medal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import type { CompeteLeaderboard } from './api';

/** Live ranking of a round; the player's own row is highlighted (and pinned when outside the top). */
export function Leaderboard({
  data,
  currency,
  loading,
  limit = 20,
}: {
  data: CompeteLeaderboard | undefined;
  currency: string;
  loading?: boolean;
  limit?: number;
}) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const rows = data?.rows.slice(0, limit) ?? [];
  const meOutside = data?.me && !rows.some((r) => r.isMe) ? data.me : null;
  return (
    <Card padding="none" className="overflow-hidden" aria-labelledby="lb-title">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="lb-title" className="font-semibold">
          {t('leaderboard.title')}
        </h2>
        {data && (
          <span className="text-xs text-muted">
            {t('leaderboard.players', { count: data.participants })}
          </span>
        )}
      </div>
      {loading && !data ? (
        <div className="p-5">
          <Skeleton className="h-48 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-muted">{t('leaderboard.empty')}</p>
      ) : (
        <table className="w-full text-sm" aria-describedby="lb-title">
          <thead className="sr-only">
            <tr>
              <th>{t('leaderboard.rank')}</th>
              <th>{t('leaderboard.player')}</th>
              <th>{t('leaderboard.return')}</th>
              <th>{t('leaderboard.prize')}</th>
            </tr>
          </thead>
          <tbody>
            {[...rows, ...(meOutside ? [meOutside] : [])].map((r) => {
              const ret = Number(r.returnBps);
              return (
                <tr
                  key={`${r.rank}-${r.nickname}`}
                  className={cn(
                    'border-b border-border last:border-0',
                    r.isMe && 'bg-primary-tint/30',
                    r === meOutside && 'border-t-2 border-t-border-strong',
                  )}
                >
                  <td className="w-14 py-2.5 pr-2 pl-5 font-semibold tabular-nums">
                    {r.rank <= 3 ? (
                      <span className="inline-flex items-center gap-1">
                        <Medal
                          className={cn('size-4', r.rank === 1 ? 'text-accent' : 'text-muted')}
                          aria-hidden="true"
                        />
                        {r.rank}
                      </span>
                    ) : (
                      r.rank
                    )}
                  </td>
                  <td className="py-2.5">
                    <span className="font-medium">{r.nickname}</span>
                    {r.isMe && (
                      <span className="ml-2 text-xs font-semibold text-accent">
                        {t('leaderboard.you')}
                      </span>
                    )}
                    {r.status === 'BREACHED' && (
                      <span className="ml-2 text-xs text-loss">{t('leaderboard.out')}</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      'py-2.5 text-right font-semibold tabular-nums',
                      ret > 0 ? 'text-profit' : ret < 0 ? 'text-loss' : 'text-muted',
                    )}
                  >
                    {(ret > 0 ? '+' : '') + f.bps(ret)}
                  </td>
                  <td className="py-2.5 pr-5 text-right tabular-nums text-muted">
                    {r.prizeMinor !== '0' ? f.money(r.prizeMinor, currency) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
