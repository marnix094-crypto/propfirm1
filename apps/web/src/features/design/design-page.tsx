import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, Gauge, Layers, Sparkles, Wallet, Zap } from 'lucide-react';
import { INTL_LOCALE, type Locale } from '@brand/shared';
import { meterState } from '@brand/engine';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { Stepper } from '@/components/ui/stepper';
import { Meter } from '@/components/ui/meter';
import { RadialMeter } from '@/components/ui/radial-meter';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { CountUp } from '@/components/motion/count-up';
import { Sparkline } from '@/components/motion/sparkline';
import { FloatingCard } from '@/components/motion/floating-card';
import { formatBps, formatLeverage, formatMoneyMinor } from '@/lib/format';
import { ContrastLab } from './contrast-lab';
import { exampleSeries } from './example-data';

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 py-10 sm:py-14">
      <Reveal className="mb-6 sm:mb-8">
        <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </Reveal>
      {children}
    </section>
  );
}

const SWATCHES = [
  'bg',
  'card',
  'border',
  'primary',
  'primary-light',
  'primary-tint',
  'accent-deep',
  'text',
  'text-muted',
  'glow-aqua',
  'glow-lavender',
  'profit',
  'loss',
  'meter-warn',
] as const;

const RANGES = ['1W', '1M', '3M', '6M', '1Y'] as const;
const LEVERAGE_MARKS = [1, 10, 25, 50, 100];

export function DesignPage() {
  const { t, i18n } = useTranslation();
  const locale = INTL_LOCALE[(i18n.language as Locale) ?? 'en'] ?? 'en-US';
  const usd = useCallback(
    (v: number | bigint) => formatMoneyMinor(BigInt(v), 'USD', locale),
    [locale],
  );

  const [leverage, setLeverage] = useState(25);
  const [qty, setQty] = useState(1);
  const [range, setRange] = useState<string>('1M');
  const series = useMemo(() => exampleSeries(range), [range]);

  const unitPriceMinor = 49_900n; // example price, labelled as such in the UI
  const stateLabels = { safe: t('meter.safe'), warn: t('meter.warn'), breach: t('meter.breach') };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-card focus:px-4 focus:py-2"
      >
        {t('a11y.skipToContent')}
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* Intro */}
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-12 pb-6 sm:pt-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Reveal>
            <Badge variant="primary">
              <Sparkles aria-hidden="true" /> {t('design.badge')}
            </Badge>
            <GradientHeading as="h1" className="mt-5">
              {t('design.title')}
            </GradientHeading>
            <p className="mt-5 max-w-xl text-lg text-muted">{t('design.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg">
                {t('design.ctaPrimary')} <ArrowRight aria-hidden="true" />
              </Button>
              <Button size="lg" variant="secondary">
                {t('design.ctaSecondary')}
              </Button>
            </div>
          </Reveal>
          <div className="relative">
            <Card variant="glass" padding="lg">
              <div className="flex flex-wrap-reverse items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{t('design.equity')}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                    <CountUp value={10_482_350n} format={usd} />
                  </p>
                  <p className="mt-1 text-sm font-semibold text-profit tabular-nums">
                    {formatMoneyMinor(482_350n, 'USD', locale, { signDisplay: 'exceptZero' })} ·{' '}
                    {formatBps(482, locale, 2).replace(/^/, '+')}
                  </p>
                </div>
                <Badge variant="simulated">{t('common.simulated')}</Badge>
              </div>
              <Sparkline data={exampleSeries('1M')} className="mt-6 h-24 w-full" />
            </Card>
            <FloatingCard className="absolute -bottom-8 -left-2 w-64 sm:-left-8">
              <div className="flex items-center gap-3">
                <IconTile icon={Wallet} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t('design.notification.title')}</p>
                  <p className="text-xs text-muted tabular-nums">{t('design.notification.body')}</p>
                </div>
              </div>
              <Badge variant="neutral" className="mt-3">
                {t('common.example')}
              </Badge>
            </FloatingCard>
          </div>
        </div>

        <Section
          id="colors"
          title={t('design.sections.colors.title')}
          description={t('design.sections.colors.description')}
        >
          <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map((name) => (
              <RevealItem key={name}>
                <div className="overflow-hidden rounded-[18px] border border-border bg-card">
                  <div
                    className="h-16 border-b border-border"
                    style={{ background: `var(--${name})` }}
                  />
                  <p className="px-3 py-2 font-mono text-xs text-muted">--{name}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </Section>

        <Section id="typography" title={t('design.sections.typography.title')}>
          <Card padding="lg" className="flex flex-col gap-4">
            <GradientHeading as="h3" size="h1">
              {t('design.typo.display')}
            </GradientHeading>
            <GradientHeading as="h3">{t('design.typo.heading')}</GradientHeading>
            <p className="max-w-2xl">{t('design.typo.body')}</p>
            <p className="max-w-2xl text-sm text-muted">{t('design.typo.muted')}</p>
            <div className="flex flex-wrap gap-6 text-xl font-semibold tabular-nums">
              <span className="text-profit">
                {formatMoneyMinor(124_050n, 'USD', locale, { signDisplay: 'exceptZero' })}
              </span>
              <span className="text-loss">
                {formatMoneyMinor(-38_710n, 'USD', locale, { signDisplay: 'exceptZero' })}
              </span>
              <span>{formatMoneyMinor(10_000_000n, 'USD', locale)}</span>
            </div>
          </Card>
        </Section>

        <Section
          id="buttons"
          title={t('design.sections.buttons.title')}
          description={t('design.sections.buttons.description')}
        >
          <Card padding="lg" className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">{t('design.buttons.small')}</Button>
              <Button>{t('design.buttons.primary')}</Button>
              <Button size="lg">
                {t('design.buttons.large')} <ArrowRight aria-hidden="true" />
              </Button>
              <Button variant="secondary">{t('design.buttons.secondary')}</Button>
              <Button variant="ghost">{t('design.buttons.ghost')}</Button>
              <Button disabled>{t('design.buttons.disabled')}</Button>
            </div>
            <ContrastLab />
          </Card>
        </Section>

        <Section
          id="cards"
          title={t('design.sections.cards.title')}
          description={t('design.sections.cards.description')}
        >
          <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Zap, key: 'payout' },
              { icon: Gauge, key: 'leverage' },
              { icon: Layers, key: 'margin' },
              { icon: Clock, key: 'markets' },
            ].map(({ icon, key }, i) => (
              <RevealItem key={key}>
                <Card interactive variant={i % 2 ? 'glass' : 'solid'} className="h-full">
                  <IconTile icon={icon} />
                  <CardHeader className="mt-5 mb-0">
                    <CardTitle>{t(`design.cards.${key}.title`)}</CardTitle>
                    <CardDescription>{t(`design.cards.${key}.body`)}</CardDescription>
                  </CardHeader>
                </Card>
              </RevealItem>
            ))}
          </RevealGroup>
        </Section>

        <Section id="badges" title={t('design.sections.badges.title')}>
          <div className="flex flex-wrap gap-2">
            <Badge variant="recommended">{t('design.badges.recommended')}</Badge>
            <Badge variant="primary">{t('design.badges.primary')}</Badge>
            <Badge variant="simulated">{t('common.simulated')}</Badge>
            <Badge variant="success">{t('design.badges.success')}</Badge>
            <Badge variant="warning">{t('design.badges.warning')}</Badge>
            <Badge variant="danger">{t('design.badges.danger')}</Badge>
            <Badge>{t('common.example')}</Badge>
          </div>
        </Section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 lg:grid-cols-2">
          <Section id="slider" title={t('design.sections.slider.title')}>
            <Card padding="lg">
              <Slider
                label={t('design.slider.label')}
                value={leverage}
                onValueChange={setLeverage}
                min={1}
                max={100}
                marks={LEVERAGE_MARKS}
                formatValue={formatLeverage}
              />
              <CardFooter>
                <Modal
                  title={t('design.slider.modalTitle')}
                  description={t('design.slider.modalDescription')}
                  closeLabel={t('common.close')}
                  trigger={<Button variant="secondary">{t('design.slider.openModal')}</Button>}
                >
                  <Slider
                    label={t('design.slider.label')}
                    value={leverage}
                    onValueChange={setLeverage}
                    min={1}
                    max={100}
                    marks={LEVERAGE_MARKS}
                    formatValue={formatLeverage}
                  />
                  <p className="mt-6 rounded-[16px] bg-card-muted p-4 text-sm text-muted">
                    {t('design.slider.risk')}
                  </p>
                </Modal>
              </CardFooter>
            </Card>
          </Section>

          <Section id="stepper" title={t('design.sections.stepper.title')}>
            <Card padding="lg" className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-sm text-muted">{t('design.stepper.total')}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatMoneyMinor(unitPriceMinor * BigInt(qty), 'EUR', locale)}
                </p>
                <Badge className="mt-2">{t('common.examplePrice')}</Badge>
              </div>
              <Stepper
                value={qty}
                onChange={setQty}
                min={1}
                max={10}
                label={t('design.stepper.label')}
                decrementLabel={t('design.stepper.decrement')}
                incrementLabel={t('design.stepper.increment')}
              />
            </Card>
          </Section>
        </div>

        <Section
          id="meters"
          title={t('design.sections.meters.title')}
          description={t('design.sections.meters.description')}
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <Card padding="lg" className="flex flex-col gap-6">
              <Meter
                label={t('design.meters.daily')}
                used={120_000n}
                limit={500_000n}
                usedLabel={usd(120_000n)}
                limitLabel={usd(500_000n)}
                stateLabels={stateLabels}
              />
              <Meter
                label={t('design.meters.drawdown')}
                used={810_000n}
                limit={1_000_000n}
                usedLabel={usd(810_000n)}
                limitLabel={usd(1_000_000n)}
                stateLabels={stateLabels}
              />
              <Meter
                label={t('design.meters.breached')}
                used={510_000n}
                limit={500_000n}
                usedLabel={usd(510_000n)}
                limitLabel={usd(500_000n)}
                stateLabels={stateLabels}
              />
            </Card>
            <Card padding="lg" className="flex flex-col items-center justify-center gap-3">
              <RadialMeter
                value={78}
                state={meterState(22n, 100n)}
                label={t('design.meters.health')}
                valueText="78 / 100"
              >
                <span className="text-3xl font-bold tabular-nums">78</span>
                <span className="text-xs text-muted">{t('design.meters.health')}</span>
              </RadialMeter>
            </Card>
          </div>
        </Section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 lg:grid-cols-2">
          <Section id="tabs" title={t('design.sections.tabs.title')}>
            <Card padding="lg">
              <Tabs
                label={t('design.tabs.label')}
                value={range}
                onValueChange={setRange}
                items={RANGES.map((r) => ({ value: r, label: t(`range.${r}`) }))}
              >
                {RANGES.map((r) => (
                  <TabsContent key={r} value={r}>
                    <Sparkline
                      data={series}
                      className="mt-6 h-32 w-full"
                      label={t('design.tabs.chartLabel')}
                    />
                  </TabsContent>
                ))}
              </Tabs>
              <Badge className="mt-3">{t('common.exampleData')}</Badge>
            </Card>
          </Section>

          <Section id="accordion" title={t('design.sections.accordion.title')}>
            <Accordion type="single" collapsible defaultValue="q1">
              {(['q1', 'q2', 'q3'] as const).map((q) => (
                <AccordionItem key={q} value={q} question={t(`design.faq.${q}.q`)}>
                  {t(`design.faq.${q}.a`)}
                </AccordionItem>
              ))}
            </Accordion>
          </Section>
        </div>
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-muted sm:px-6">
          {t('risk.short')}
        </p>
      </footer>
    </>
  );
}
