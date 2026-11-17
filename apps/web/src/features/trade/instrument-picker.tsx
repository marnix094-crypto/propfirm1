import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Star } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/feedback';
import { useInstruments, useTickers, useWatchlist } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { formatDecimal } from '@/lib/decimal';
import type { Instrument } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { AssetAvatar, ChangeBadge, useLivePrice } from '../portfolio/markets-list';

function Row({ inst, onPick }: { inst: Instrument; onPick: () => void }) {
  const f = useFormat();
  const tickers = useTickers();
  const ticker = tickers.data?.find((x) => x.symbol === inst.symbol);
  const price = useLivePrice(inst.symbol, ticker?.last, inst.priceDecimals);
  const { symbols } = useWatchlist();
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-[14px] px-2 py-3 text-left hover:bg-primary-tint/25"
      >
        <AssetAvatar asset={inst.baseAsset} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-semibold">
            {inst.baseAsset}
            {symbols.includes(inst.symbol) && (
              <Star
                className="size-3.5 fill-[var(--meter-warn)] text-[var(--meter-warn)]"
                aria-hidden="true"
              />
            )}
          </span>
          <span className="block truncate text-sm text-muted">{inst.displayName} · Perp</span>
        </span>
        <span className="font-semibold tabular-nums">
          {formatDecimal(price, inst.priceDecimals, f.locale)}
        </span>
        <ChangeBadge bps={ticker?.changeBps} />
      </button>
    </li>
  );
}

export function InstrumentPicker({ current }: { current: Instrument }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const navigate = useNavigate();
  const instruments = useInstruments();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      (instruments.data ?? []).filter((i) =>
        [i.symbol, i.displayName, i.baseAsset].some((v) =>
          v.toLowerCase().includes(q.trim().toLowerCase()),
        ),
      ),
    [instruments.data, q],
  );
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t('app.trade.selectMarket')}
      closeLabel={t('common.close')}
      trigger={
        <button
          type="button"
          aria-label={`${t('app.trade.selectMarket')}: ${current.baseAsset}`}
          className="flex min-w-0 items-center gap-3 rounded-[16px] py-1 pr-2 text-left hover:bg-primary-tint/25"
        >
          <AssetAvatar asset={current.baseAsset} className="size-10" />
          <span className="min-w-0">
            <span className="block text-lg leading-tight font-bold">{current.baseAsset}</span>
            <span className="block truncate text-sm text-muted">{current.displayName} · Perp</span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted" aria-hidden="true" />
        </button>
      }
    >
      <label className="relative mb-2 block">
        <span className="sr-only">{t('app.trade.search')}</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('app.trade.search')}
          className={cn(
            'h-11 w-full rounded-btn border border-border bg-card pr-3 pl-10 text-[15px] focus-visible:border-primary focus-visible:outline-none',
          )}
        />
      </label>
      {list.length === 0 ? (
        <EmptyState title={t('app.trade.noResults')} />
      ) : (
        <ul>
          {list.map((i) => (
            <Row
              key={i.symbol}
              inst={i}
              onPick={() => {
                setOpen(false);
                setQ('');
                void navigate(`/${lang}/app/trade/${i.symbol}`);
              }}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
