import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Medal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';
import { ReturnText } from './arena-ui';
import type { CompeteLeaderboard, CompeteLeaderboardRow } from './api';

function Row({ r, currency }: { r: CompeteLeaderboardRow; currency: string }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  const prize = r.prizeMinor !== '0';
  return (
    <li
      className={cn(
        'grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2.5 text-sm',
        r.isMe && 'bg-primary-tint/40 font-semibold',
      )}
      aria-current={r.isMe ? 'true' : undefined}
    >
      <span className="text-center font-semibold text-muted tabular-nums">{r.rank}</span>
      <span className="min-w-0 truncate">
        {r.nickname}
        {r.isMe && (
          <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-[var(--btn-primary-fg)] uppercase">
            {t('leaderboard.you')}
          </span>
        )}
        {r.status === 'BREACHED' && (
          <span className="ml-2 text-xs font-medium text-loss">{t('leaderboard.out')}</span>
        )}
      </span>
      <ReturnText bps={r.returnBps} className="font-semibold" />
      <span className="w-20 text-right text-xs text-muted tabular-nums">
        {prize ? f.money(r.prizeMinor, currency) : ''}
      </span>
    </li>
  );
}

/** Top three as cards: who is winning what, at a glance. */
function Top3({ rows, currency }: { rows: CompeteLeaderboardRow[]; currency: string }) {
  const { t } = useTranslation('compete');
  const f = useFormat();
  return (
    <ol className="grid gap-2 p-4" aria-label={t('leaderboard.top3')}>
      {rows.map((r) => (
        <li
          key={r.rank}
          className={cn(
            'flex items-center gap-3 rounded-[14px] border px-3 py-2.5',
            r.rank === 1 ? 'glow-card-strong border-primary/60' : 'border-border bg-card-muted/50',
            r.isMe && 'ring-2 ring-primary',
          )}
        >
          <span
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
              r.rank === 1 ? 'bg-primary text-[var(--btn-primary-fg)]' : 'bg-card text-muted',
            )}
          >
            {r.rank === 1 ? (
              <Crown className="size-4" aria-hidden="true" />
            ) : (
              <Medal className="size-4" aria-hidden="true" />
            )}
            <span className="sr-only">{t('leaderboard.rankN', { n: r.rank })}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {r.nickname}
              {r.isMe && (
                <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 align-middle text-[10px] font-bold text-[var(--btn-primary-fg)] uppercase">
                  {t('leaderboard.you')}
                </span>
              )}
            </span>
            <ReturnText bps={r.returnBps} className="text-xs font-semibold" />
          </span>
          <span className="font-display text-sm font-bold tabular-nums">
            {r.prizeMinor !== '0' ? f.money(r.prizeMinor, currency) : '—'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Live ranking (D107): podium for the top 3, a scrollable list for the rest and the
 * player's own row pinned at the bottom when it is outside the visible part.
 */
export function Leaderboard({
  data,
  currency,
  loading,
  limit = 10,
  title,
  className,
}: {
  data: CompeteLeaderboard | undefined;
  currency: string;
  loading?: boolean;
  limit?: number;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation('compete');
  const [all, setAll] = useState(false);
  const rows = data?.rows ?? [];
  const top = rows.filter((r) => r.rank <= 3);
  const rest = rows.filter((r) => r.rank > 3).slice(0, all ? undefined : Math.max(0, limit - 3));
  const visible = [...top, ...rest];
  const meOutside = data?.me && !visible.some((r) => r.isMe) ? data.me : null;
  const more = rows.length > visible.length;

  return (
    <Card padding="none" className={cn('flex flex-col overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h2 id="lb-title" className="font-semibold">
          {title ?? t('leaderboard.title')}
        </h2>
        {data && (
          <span className="rounded-full bg-card-muted px-2.5 py-1 text-xs font-semibold text-muted">
            {t('leaderboard.players', { count: data.participants })}
          </span>
        )}
      </div>
      {loading && !data ? (
        <div className="p-4">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">{t('leaderboard.empty')}</p>
      ) : (
        <>
          <Top3 rows={top} currency={currency} />
          {rest.length > 0 && (
            <ol
              className={cn(
                'divide-y divide-border border-t border-border',
                all && 'max-h-[420px] overflow-y-auto',
              )}
              aria-labelledby="lb-title"
            >
              {rest.map((r) => (
                <Row key={`${r.rank}-${r.nickname}`} r={r} currency={currency} />
              ))}
            </ol>
          )}
          {meOutside && (
            <ol className="border-t-2 border-border-strong" aria-label={t('leaderboard.myRank')}>
              <Row r={meOutside} currency={currency} />
            </ol>
          )}
          {(more || all) && rows.length > limit && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="border-t border-border px-4 py-3 text-sm font-semibold text-link hover:bg-card-muted"
            >
              {all ? t('leaderboard.showLess') : t('leaderboard.showAll', { count: rows.length })}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
