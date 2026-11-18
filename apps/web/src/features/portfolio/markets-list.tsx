import { useMemo, useState } from 'react';
import { parseDecimalRounded, toDecimalString } from '@brand/engine';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useInstruments, useTickers, useWatchlist } from '@/hooks/use-trading';
import { useLiveSymbols } from '@/hooks/use-realtime';
import { useFormat } from '@/hooks/use-format';
import { useQuote } from '@/stores/trading';
import { formatDecimal } from '@/lib/decimal';
import { cn } from '@/lib/cn';
import type { Instrument, Ticker } from '@/lib/api-client';

export function AssetAvatar({ asset, className }: { asset: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-border bg-card-muted text-[10px] font-semibold tracking-wide text-muted',
        className,
      )}
    >
      {asset.slice(0, 4)}
    </span>
  );
}

/** Mid price from the live quote store, falling back to the ticker. */
export function useLivePrice(
  symbol: string,
  fallback: string | null | undefined,
  decimals: number,
): string | null {
  const q = useQuote(symbol);
  return useMemo(() => {
    if (!q) return fallback ?? null;
    try {
      const mid =
        (parseDecimalRounded(q.bid, decimals) + parseDecimalRounded(q.ask, decimals)) / 2n;
      return toDecimalString(mid, decimals);
    } catch {
      return fallback ?? null;
    }
  }, [q, fallback, decimals]);
}

export function ChangeBadge({
  bps,
  className,
}: {
  bps: number | null | undefined;
  className?: string;
}) {
  const f = useFormat();
  if (bps === null || bps === undefined)
    return <span className={cn('text-sm text-muted', className)}>—</span>;
  const up = bps >= 0;
  return (
    <span
      className={cn(
        'inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
        up
          ? 'bg-[color-mix(in_srgb,var(--profit)_14%,transparent)] text-[var(--badge-success-fg)]'
          : 'bg-[color-mix(in_srgb,var(--loss)_12%,transparent)] text-[var(--badge-danger-fg)]',
        className,
      )}
    >
      {up ? '+' : ''}
      {f.bps(bps)}
    </span>
  );
}

function MarketRow({
  inst,
  ticker,
  fav,
  onToggle,
}: {
  inst: Instrument;
  ticker?: Ticker;
  fav: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const f = useFormat();
  const price = useLivePrice(inst.symbol, ticker?.last, inst.priceDecimals);
  return (
    <li className="flex items-center gap-2 border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={fav}
        aria-label={t(fav ? 'app.portfolio.removeFavorite' : 'app.portfolio.addFavorite', {
          symbol: inst.baseAsset,
        })}
        className="rounded-full p-2 text-muted transition-colors hover:text-[var(--meter-warn)]"
      >
        <Star
          className={cn('size-5', fav && 'fill-[var(--meter-warn)] text-[var(--meter-warn)]')}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={() => void navigate(`/${lang}/app/trade/${inst.symbol}`)}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-1 text-left"
      >
        <AssetAvatar asset={inst.baseAsset} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{inst.baseAsset}</span>
          <span className="block truncate text-sm text-muted">
            {inst.displayName} · {inst.quoteAsset}
          </span>
        </span>
        <span className="text-right font-semibold tabular-nums">
          {formatDecimal(price, inst.priceDecimals, f.locale)}
        </span>
        <ChangeBadge bps={ticker?.changeBps} />
      </button>
    </li>
  );
}

export function MarketsList() {
  const { t } = useTranslation();
  const instruments = useInstruments();
  const tickers = useTickers();
  const watchlist = useWatchlist();
  const [tab, setTab] = useState<'fav' | 'all'>('fav');
  const all = instruments.data ?? [];
  useLiveSymbols(all.map((i) => i.symbol));
  const list = tab === 'fav' ? all.filter((i) => watchlist.symbols.includes(i.symbol)) : all;
  const tickerBy = new Map((tickers.data ?? []).map((x) => [x.symbol, x]));

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-sm font-semibold">{t('app.portfolio.markets')}</h2>
        <Tabs
          label={t('app.portfolio.markets')}
          value={tab}
          onValueChange={(v) => setTab(v as 'fav' | 'all')}
          items={[
            { value: 'fav', label: t('app.portfolio.favorites') },
            { value: 'all', label: t('app.portfolio.all') },
          ]}
        />
      </div>
      <div className="px-3 pt-2 pb-3">
        {instruments.isPending ? (
          <div className="flex flex-col gap-3 p-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : instruments.isError ? (
          <ErrorState
            title={t('errors.generic')}
            retryLabel={t('common.retry')}
            onRetry={() => void instruments.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title={t('app.portfolio.favorites')}
            body={t('app.portfolio.noFavorites')}
            icon={<Star className="size-7" />}
          />
        ) : (
          <ul>
            {list.map((i) => (
              <MarketRow
                key={i.symbol}
                inst={i}
                ticker={tickerBy.get(i.symbol)}
                fav={watchlist.symbols.includes(i.symbol)}
                onToggle={() => watchlist.toggle(i.symbol)}
              />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
