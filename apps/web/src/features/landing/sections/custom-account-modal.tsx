import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Slider } from '@/components/ui/slider';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { usePriceQuote } from '@/hooks/use-catalog';
import { useFormat } from '@/hooks/use-format';

const DRAWDOWN_OPTIONS = [400, 600, 800];
const SIZE_STEP = 5_000;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Custom account configurator. The price is always calculated by the server (POST /products/quote). */
export function CustomAccountModal({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const f = useFormat();
  const [sizeUsd, setSizeUsd] = useState(30_000);
  const [drawdownBps, setDrawdownBps] = useState(600);
  const quote = usePriceQuote();
  const { mutate } = quote;

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(
      () =>
        mutate({
          type: 'INSTANT',
          accountSizeMinor: String(sizeUsd * 100),
          maxDrawdownBps: drawdownBps,
        }),
      250,
    );
    return () => window.clearTimeout(id);
  }, [open, sizeUsd, drawdownBps, mutate]);

  const data = quote.data;
  const isCurrent =
    data &&
    data.accountSizeMinor === String(sizeUsd * 100) &&
    data.rules.maxDrawdownBps === drawdownBps;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('landing.custom.title')}
      description={t('landing.custom.description')}
      closeLabel={t('common.close')}
    >
      <div className="flex flex-col gap-6">
        <Slider
          label={t('landing.custom.size')}
          value={sizeUsd}
          onValueChange={setSizeUsd}
          min={SIZE_STEP}
          max={200_000}
          step={SIZE_STEP}
          formatValue={(v) => f.moneyWhole(BigInt(v) * 100n, 'USD')}
        />
        <div>
          <p className="mb-3 text-sm font-medium text-muted">{t('landing.custom.drawdown')}</p>
          <Tabs
            label={t('landing.custom.drawdown')}
            value={String(drawdownBps)}
            onValueChange={(v) => setDrawdownBps(Number(v))}
            items={DRAWDOWN_OPTIONS.map((b) => ({ value: String(b), label: f.bps(b) }))}
          />
        </div>
        <div
          className="flex min-h-20 items-center justify-between gap-4 rounded-[18px] bg-card-muted p-4"
          aria-live="polite"
        >
          <div>
            <p className="text-sm text-muted">{t('landing.custom.price')}</p>
            {quote.isError ? (
              <p className="font-semibold text-loss">{t('landing.custom.error')}</p>
            ) : (
              <p className="text-2xl font-bold tabular-nums" data-testid="custom-price">
                {data ? f.money(data.priceMinor, data.priceCurrency) : '—'}
              </p>
            )}
          </div>
          {(quote.isPending || !isCurrent) && !quote.isError && (
            <Loader2
              className="size-5 text-muted motion-safe:animate-spin"
              aria-label={t('common.loading')}
            />
          )}
        </div>
        <p className="text-xs text-muted">{t('landing.custom.note')}</p>
        <Button asChild fullWidth disabled={!isCurrent}>
          {isCurrent ? (
            <Link to={`/${lang}/register?quote=${encodeURIComponent(data.quoteId)}`}>
              {t('landing.custom.continue')}
            </Link>
          ) : (
            <span aria-disabled="true">{t('landing.custom.continue')}</span>
          )}
        </Button>
      </div>
    </Modal>
  );
}
