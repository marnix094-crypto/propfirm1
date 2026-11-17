import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  divRoundHalfEven,
  fromDecimalString,
  notionalMinor,
  toDecimalString,
  type InstrumentSpec,
} from '@brand/engine';
import { Input } from '@/components/ui/field';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/toaster';
import { usePlaceOrder } from '@/hooks/use-trading';
import { useFormat } from '@/hooks/use-format';
import { formatDecimal, normalizeDecimalInput } from '@/lib/decimal';
import { errorMessage } from '@/lib/errors';
import { useQuote } from '@/stores/trading';
import { cn } from '@/lib/cn';
import type { Account, Instrument } from '@/lib/api-client';

type Side = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT' | 'STOP';

export function specFrom(i: Instrument): InstrumentSpec {
  return {
    symbol: i.symbol,
    priceDecimals: i.priceDecimals,
    qtyDecimals: i.qtyDecimals,
    tickSize: fromDecimalString(i.tickSize, i.priceDecimals),
    minQty: fromDecimalString(i.minQty, i.qtyDecimals),
    qtyStep: fromDecimalString(i.qtyStep, i.qtyDecimals),
    maxLeverage: i.maxLeverage,
    spreadMarkupBps: 0,
    commissionBps: i.commissionBps,
    slippageBaseBps: 0,
    slippageImpactBpsPer100k: 0,
    slippageMaxBps: 0,
  };
}

const parse = (s: string, decimals: number): bigint | null => {
  const n = normalizeDecimalInput(s);
  if (n === null) return null;
  try {
    return fromDecimalString(n, decimals);
  } catch {
    return null;
  }
};

interface Props {
  instrument: Instrument;
  account: Account;
  onDone?: () => void;
}

export function OrderForm({ instrument, account, onDone }: Props) {
  const { t } = useTranslation();
  const f = useFormat();
  const spec = useMemo(() => specFrom(instrument), [instrument]);
  const quote = useQuote(instrument.symbol);
  const place = usePlaceOrder(account.id);
  const maxLev = Math.min(account.maxLeverage, instrument.maxLeverage);

  const [side, setSide] = useState<Side>('BUY');
  const [type, setType] = useState<OrderType>('MARKET');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [leverage, setLeverage] = useState(Math.min(10, maxLev));
  const [withSlTp, setWithSlTp] = useState(false);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const qtyInt = parse(qty, spec.qtyDecimals);
  const touch = quote ? parse(side === 'BUY' ? quote.ask : quote.bid, spec.priceDecimals) : null;
  const refPrice = type === 'MARKET' ? touch : parse(price, spec.priceDecimals);
  const free = BigInt(account.freeMarginMinor);

  const est = useMemo(() => {
    if (!refPrice || !qtyInt || qtyInt <= 0n) return null;
    const notional = notionalMinor(refPrice, qtyInt, spec);
    return {
      notional,
      margin: divRoundHalfEven(notional, BigInt(leverage)),
      fee: divRoundHalfEven(notional * BigInt(spec.commissionBps), 10_000n),
    };
  }, [refPrice, qtyInt, spec, leverage]);

  /** Size for a share of free margin, floored to the size step. */
  function fillPercent(pct: number) {
    if (!refPrice || refPrice <= 0n) return;
    const budget = (free * BigInt(pct)) / 100n;
    const scale = 10n ** BigInt(spec.priceDecimals + spec.qtyDecimals);
    // margin + fee ≤ budget  →  qty ≤ budget·scale / (price·100·(1/lev + fee))
    const denom = refPrice * 100n * (10_000n + BigInt(leverage * spec.commissionBps));
    let q = (budget * scale * BigInt(leverage) * 10_000n) / denom;
    q -= q % spec.qtyStep;
    if (q < spec.minQty) q = 0n;
    setQty(q > 0n ? toDecimalString(q, spec.qtyDecimals) : '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const q = normalizeDecimalInput(qty);
    if (!q || !qtyInt || qtyInt <= 0n) return setError(t('errors.INVALID_QTY'));
    const p = normalizeDecimalInput(price);
    if (type !== 'MARKET' && !p)
      return setError(
        t(type === 'LIMIT' ? 'errors.LIMIT_PRICE_REQUIRED' : 'errors.STOP_PRICE_REQUIRED'),
      );
    const slN = withSlTp ? normalizeDecimalInput(sl) : null;
    const tpN = withSlTp ? normalizeDecimalInput(tp) : null;
    place.mutate(
      {
        symbol: instrument.symbol,
        side,
        type,
        qty: q,
        leverage,
        ...(type === 'LIMIT' ? { limitPrice: p! } : {}),
        ...(type === 'STOP' ? { stopPrice: p! } : {}),
        ...(slN ? { slPrice: slN } : {}),
        ...(tpN ? { tpPrice: tpN } : {}),
      },
      {
        onSuccess: (order) => {
          toast({
            kind: 'success',
            title:
              order.status === 'FILLED' ? t('app.trade.orderFilled') : t('app.trade.orderPlaced'),
            body: `${t(`app.trade.${order.side}`)} ${order.qty} ${instrument.baseAsset}${order.avgFillPrice ? ` @ ${order.avgFillPrice}` : ''}`,
          });
          setQty('');
          onDone?.();
        },
        onError: (err) => setError(errorMessage(t, err)),
      },
    );
  }

  const segBtn = (active: boolean, tone?: 'buy' | 'sell') =>
    cn(
      'h-11 flex-1 rounded-[11px] text-sm font-bold transition-colors',
      active
        ? tone === 'buy'
          ? 'bg-[var(--buy-bg)] text-[var(--on-trade-action)]'
          : tone === 'sell'
            ? 'bg-[var(--sell-bg)] text-[var(--on-trade-action)]'
            : 'bg-primary-tint/70 text-fg'
        : 'text-muted hover:text-fg',
    );

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="flex flex-col gap-4"
      aria-label={t('app.trade.orderTitle')}
    >
      <div
        role="radiogroup"
        aria-label={t('app.trade.side')}
        className="flex gap-1 rounded-btn border border-border bg-card p-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={side === 'BUY'}
          className={segBtn(side === 'BUY', 'buy')}
          onClick={() => setSide('BUY')}
        >
          {t('app.trade.buy')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={side === 'SELL'}
          className={segBtn(side === 'SELL', 'sell')}
          onClick={() => setSide('SELL')}
        >
          {t('app.trade.sell')}
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label={t('app.trade.orderType')}
        className="flex gap-1 rounded-btn border border-border bg-card p-1"
      >
        {(['MARKET', 'LIMIT', 'STOP'] as const).map((ty) => (
          <button
            key={ty}
            type="button"
            role="radio"
            aria-checked={type === ty}
            className={cn(segBtn(type === ty), 'h-9')}
            onClick={() => setType(ty)}
          >
            {t(`app.trade.${ty}`)}
          </button>
        ))}
      </div>

      {type !== 'MARKET' && (
        <Input
          label={t(type === 'LIMIT' ? 'app.trade.limitPrice' : 'app.trade.stopPrice')}
          inputMode="decimal"
          autoComplete="off"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={touch ? toDecimalString(touch, spec.priceDecimals) : ''}
          suffix={instrument.quoteAsset}
        />
      )}

      <div>
        <Input
          label={t('app.trade.size')}
          inputMode="decimal"
          autoComplete="off"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={instrument.minQty}
          suffix={instrument.baseAsset}
          hint={`${t('app.trade.available')}: ${f.money(free, account.currency)}`}
        />
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => fillPercent(p)}
              className="h-8 rounded-[10px] border border-border text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-fg"
            >
              {p}%
            </button>
          ))}
        </div>
      </div>

      <Slider
        label={t('app.trade.leverage')}
        value={leverage}
        onValueChange={setLeverage}
        min={1}
        max={maxLev}
        formatValue={f.leverage}
      />

      <label className="flex items-center gap-2.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={withSlTp}
          onChange={(e) => setWithSlTp(e.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        {t('app.trade.addSlTp')}
      </label>
      {withSlTp && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t('app.trade.sl')}
            inputMode="decimal"
            value={sl}
            onChange={(e) => setSl(e.target.value)}
            autoComplete="off"
          />
          <Input
            label={t('app.trade.tp')}
            inputMode="decimal"
            value={tp}
            onChange={(e) => setTp(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}

      <div className="rounded-[16px] bg-card-muted p-3.5 text-sm">
        <dl className="flex flex-col gap-1.5" aria-live="polite">
          {[
            [
              'estPrice',
              refPrice
                ? `${formatDecimal(toDecimalString(refPrice, spec.priceDecimals), spec.priceDecimals, f.locale)} ${instrument.quoteAsset}`
                : '—',
            ],
            ['notional', est ? f.money(est.notional, account.currency) : '—'],
            ['margin', est ? f.money(est.margin, account.currency) : '—'],
            ['fee', est ? f.money(est.fee, account.currency) : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-muted">{t(`app.trade.${k}`)}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">{t('app.trade.estimateNote')}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-[14px] bg-[color-mix(in_srgb,var(--loss)_10%,transparent)] px-3.5 py-2.5 text-sm font-medium text-[var(--badge-danger-fg)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={place.isPending}
        className={cn(
          'inline-flex h-13 items-center justify-center gap-2 rounded-btn text-base font-bold text-[var(--on-trade-action)] transition-[filter] hover:brightness-110 disabled:opacity-60',
          side === 'BUY' ? 'bg-[var(--buy-bg)]' : 'bg-[var(--sell-bg)]',
        )}
      >
        {place.isPending && (
          <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" />
        )}
        {t(side === 'BUY' ? 'app.trade.submitBuy' : 'app.trade.submitSell', {
          symbol: instrument.baseAsset,
        })}
      </button>
    </form>
  );
}
