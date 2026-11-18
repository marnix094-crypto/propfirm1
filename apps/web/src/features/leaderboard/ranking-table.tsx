import { useTranslation } from 'react-i18next';
import type { RankingRow } from '@/hooks/use-features';
import { useFormat } from '@/hooks/use-format';
import { cn } from '@/lib/cn';

/** Ranking by return; your own row is highlighted. Nicknames/anonymous labels only. */
export function RankingTable({ rows, testId }: { rows: RankingRow[]; testId?: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[520px] text-sm" data-testid={testId}>
        <thead>
          <tr className="text-left text-xs text-muted">
            {['rank', 'trader', 'return', 'pnl', 'size', 'trades'].map((c) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  'px-4 py-2.5 font-medium',
                  c !== 'trader' && c !== 'rank' && 'text-right',
                )}
              >
                {t(`ranking.col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pnl = BigInt(r.pnlMinor);
            return (
              <tr
                key={`${r.rank}-${r.name}`}
                className={cn('border-t border-border', r.isYou && 'bg-primary-tint/40')}
              >
                <td className="px-4 py-3 tabular-nums">
                  <span
                    className={cn(
                      'inline-flex min-w-7 items-center justify-center rounded-sm px-1.5 py-0.5 text-xs font-semibold',
                      r.rank <= 3 ? 'bg-primary text-[var(--btn-primary-fg)]' : 'text-muted',
                    )}
                  >
                    {r.rank}
                  </span>
                </td>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {r.name}
                  {r.isYou && <span className="ml-2 text-xs text-muted">({t('ranking.you')})</span>}
                </th>
                <td
                  className={cn(
                    'px-4 py-3 text-right font-semibold tabular-nums',
                    r.returnBps > 0 ? 'text-profit' : r.returnBps < 0 ? 'text-loss' : undefined,
                  )}
                >
                  {r.returnBps > 0 ? '+' : ''}
                  {f.bps(r.returnBps)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {f.money(pnl, 'USD', { signDisplay: 'exceptZero' })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {f.moneyWhole(r.accountSizeMinor, 'USD')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.trades}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
