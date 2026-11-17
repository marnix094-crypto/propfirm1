import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Gauge, Layers, Zap } from 'lucide-react';
import { divRoundHalfEven } from '@brand/engine';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Slider } from '@/components/ui/slider';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { useFormat } from '@/hooks/use-format';
import { LandingSection } from '../section';

const LEVERAGE_MARKS = [1, 10, 20, 30, 40, 50];
const EXAMPLE_POSITION_MINOR = 1_000_000n; // $10,000 position (example)
const MARKETS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE'];

function FeatureHeader({ icon, title, body }: { icon: typeof Zap; title: string; body: string }) {
  return (
    <>
      <IconTile icon={icon} />
      <h3 className="mt-5 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-muted">{body}</p>
    </>
  );
}

function LeverageFeature() {
  const { t } = useTranslation();
  const f = useFormat();
  const [leverage, setLeverage] = useState(20);
  // margin = notional / leverage, exact integer maths (half-even)
  const marginMinor = divRoundHalfEven(EXAMPLE_POSITION_MINOR, BigInt(leverage)); // notional / leverage
  const slider = (
    <Slider
      label={t('landing.features.leverage.slider')}
      value={leverage}
      onValueChange={setLeverage}
      min={1}
      max={50}
      marks={LEVERAGE_MARKS}
      formatValue={f.leverage}
    />
  );
  const margin = (
    <p className="mt-5 flex flex-wrap items-baseline justify-between gap-2 rounded-[16px] bg-card-muted px-4 py-3 text-sm">
      <span className="text-muted">
        {t('landing.features.leverage.margin', {
          size: f.moneyWhole(EXAMPLE_POSITION_MINOR, 'USD'),
        })}
      </span>
      <span className="font-semibold tabular-nums">{f.money(marginMinor, 'USD')}</span>
    </p>
  );
  return (
    <Card padding="lg" className="h-full">
      <FeatureHeader
        icon={Gauge}
        title={t('landing.features.leverage.title')}
        body={t('landing.features.leverage.body')}
      />
      <div className="mt-6">{slider}</div>
      {margin}
      <Modal
        title={t('landing.features.leverage.modalTitle')}
        description={t('landing.features.leverage.modalDescription')}
        closeLabel={t('common.close')}
        trigger={
          <Button variant="ghost" size="sm" className="mt-4 -ml-3 text-link">
            {t('landing.features.leverage.learnMore')} <ArrowRight aria-hidden="true" />
          </Button>
        }
      >
        {slider}
        {margin}
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-muted">
          <li>{t('landing.features.leverage.point1')}</li>
          <li>{t('landing.features.leverage.point2')}</li>
          <li>{t('landing.features.leverage.point3')}</li>
        </ul>
      </Modal>
    </Card>
  );
}

export function Features() {
  const { t } = useTranslation();
  return (
    <LandingSection
      id="features"
      eyebrow={t('landing.features.eyebrow')}
      title={t('landing.features.title')}
      subtitle={t('landing.features.subtitle')}
    >
      <RevealGroup className="grid gap-5 md:grid-cols-2">
        <RevealItem>
          <Card interactive padding="lg" className="h-full">
            <FeatureHeader
              icon={Zap}
              title={t('landing.features.payout.title')}
              body={t('landing.features.payout.body')}
            />
            <ol className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              {(['request', 'review', 'paid'] as const).map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-card-muted px-3 py-1.5 font-medium">
                    {t(`landing.features.payout.${s}`)}
                  </span>
                  {i < 2 && <ArrowRight className="size-4 text-muted" aria-hidden="true" />}
                </li>
              ))}
            </ol>
          </Card>
        </RevealItem>
        <RevealItem>
          <LeverageFeature />
        </RevealItem>
        <RevealItem>
          <Card interactive padding="lg" className="h-full">
            <FeatureHeader
              icon={Layers}
              title={t('landing.features.margin.title')}
              body={t('landing.features.margin.body')}
            />
            <div className="mt-6 space-y-2" aria-hidden="true">
              <div className="flex h-3 overflow-hidden rounded-full bg-[var(--meter-track)]">
                <div className="w-[38%] bg-primary" />
                <div className="w-[22%] bg-[var(--glow-lavender)]" />
              </div>
              <div className="flex justify-between text-xs text-muted">
                <span>{t('landing.features.margin.used')}</span>
                <span>{t('landing.features.margin.free')}</span>
              </div>
            </div>
          </Card>
        </RevealItem>
        <RevealItem>
          <Card interactive padding="lg" className="h-full">
            <FeatureHeader
              icon={Clock}
              title={t('landing.features.markets.title')}
              body={t('landing.features.markets.body')}
            />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Badge variant="success">
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full rounded-full bg-[var(--profit)] opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--profit)]" />
                </span>
                {t('landing.features.markets.open')}
              </Badge>
              {MARKETS.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold"
                >
                  {m}/USDT
                </span>
              ))}
            </div>
          </Card>
        </RevealItem>
      </RevealGroup>
    </LandingSection>
  );
}
