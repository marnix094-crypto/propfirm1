import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Gauge,
  Globe2,
  Palette,
  Radio,
  Scale,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { COMPETE_DEFAULTS, prizeBreakdown } from '@brand/engine';
import { brand } from '@/config/brand';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SkipLink } from '@/components/layout/skip-link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useFormat } from '@/hooks/use-format';
import competeDashboard from '@/assets/site/compete-dashboard.webp';
import competeHome from '@/assets/site/compete-home.webp';
import competeAdmin from '@/assets/site/compete-admin.webp';
import { EASE, Eyebrow, GridBackdrop, SectionTitle } from './fx';
import { BrowserFrame } from './showcase';

const FEATURES = [
  { k: 'live', icon: Radio },
  { k: 'rules', icon: ShieldAlert },
  { k: 'brand', icon: Palette },
  { k: 'admin', icon: ClipboardList },
  { k: 'market', icon: Gauge },
  { k: 'languages', icon: Globe2 },
] as const;

/** Example revenue at the default split (80% prizes, 20% operator). Labelled as example. */
function RevenueExample() {
  const { t } = useTranslation();
  const f = useFormat();
  const [players, setPlayers] = useState(200);
  const [fee, setFee] = useState(10);
  const b = prizeBreakdown({ ...COMPETE_DEFAULTS, entryFeeMinor: BigInt(fee * 100) }, players);
  const month = b.operatorMinor * 30n;
  return (
    <section className="py-24" aria-labelledby="revenue-title">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <SectionTitle
          id="revenue-title"
          eyebrow={t('site.compete.revenue.eyebrow')}
          title={t('site.compete.revenue.title')}
          body={t('site.compete.revenue.body')}
        />
        <Card padding="lg" className="flex flex-col gap-8">
          <Slider
            label={t('site.compete.revenue.players')}
            value={players}
            onValueChange={setPlayers}
            min={50}
            max={2000}
            step={50}
            formatValue={(v) => String(v)}
          />
          <Slider
            label={t('site.compete.revenue.fee')}
            value={fee}
            onValueChange={setFee}
            min={5}
            max={50}
            step={5}
            formatValue={(v) => f.moneyCompact(BigInt(v * 100), 'USD')}
          />
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">{t('site.compete.revenue.pot')}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">
                {f.money(b.potMinor, 'USD')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('site.compete.revenue.prizes')}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">
                {f.money(b.prizePoolMinor, 'USD')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('site.compete.revenue.yours')}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums text-accent">
                {f.money(b.operatorMinor, 'USD')}
              </dd>
            </div>
          </dl>
          <p className="rounded-[12px] border border-border bg-card-muted p-4 text-sm">
            {t('site.compete.revenue.month', { amount: f.money(month, 'USD') })}
            <span className="mt-1 block text-xs text-muted">
              {t('site.compete.revenue.disclaimer')}
            </span>
          </p>
        </Card>
      </div>
    </section>
  );
}

/** Daily Funded website: product page of the compete software (B2B, D105). */
export function CompeteProductPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const reduce = useReducedMotion();
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '0px 0px -10% 0px' },
          transition: { duration: 0.7, ease: EASE, delay },
        };
  return (
    <>
      <title>{t('site.compete.seo.title', { brand: brand.name })}</title>
      <meta name="description" content={t('site.compete.seo.description')} />
      <SkipLink />
      <SiteHeader />
      <main id="main">
        <section className="relative overflow-hidden" aria-labelledby="compete-hero">
          <GridBackdrop />
          <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-10 text-center sm:px-6 sm:pt-28">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            >
              <div className="flex justify-center">
                <Eyebrow>{t('site.compete.hero.eyebrow')}</Eyebrow>
              </div>
              <h1
                id="compete-hero"
                className="mt-6 font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl"
              >
                {t('site.compete.hero.title1')}{' '}
                <span className="text-accent">{t('site.compete.hero.title2')}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
                {t('site.compete.hero.body')}
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Button size="lg" asChild>
                  <Link to={`/${lang}#contact`}>
                    {t('site.compete.hero.cta')}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link to={`/${lang}/compete`}>{t('site.compete.hero.example')}</Link>
                </Button>
              </div>
            </motion.div>
          </div>
          <motion.div {...reveal(0.2)} className="relative mx-auto max-w-6xl px-4 pb-6 sm:px-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[10%] -top-6 bottom-6 rounded-[50%] bg-[radial-gradient(closest-side,rgb(175_230_4/0.3),transparent)] blur-3xl"
            />
            <BrowserFrame
              src={competeDashboard}
              alt={t('site.compete.shots.dashboard')}
              url="play.yourarena.com"
              eager
              className="relative"
            />
            <p className="mt-5 text-center text-xs text-muted">{t('site.compete.shots.caption')}</p>
          </motion.div>
        </section>

        <section className="py-24" aria-labelledby="compete-how">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionTitle
              id="compete-how"
              eyebrow={t('site.compete.how.eyebrow')}
              title={t('site.compete.how.title')}
              body={t('site.compete.how.body')}
            />
            <ol className="mt-12 grid gap-4 md:grid-cols-4">
              {(['1', '2', '3', '4'] as const).map((n, i) => (
                <motion.li key={n} {...reveal(i * 0.08)}>
                  <Card padding="lg" className="h-full">
                    <span className="font-display text-sm font-bold text-accent">0{n}</span>
                    <h3 className="mt-3 text-lg font-semibold">
                      {t(`site.compete.how.step${n}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-muted">{t(`site.compete.how.step${n}.body`)}</p>
                  </Card>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="border-y border-border bg-card-muted/40 py-24"
          aria-labelledby="compete-features"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionTitle
              id="compete-features"
              eyebrow={t('site.compete.features.eyebrow')}
              title={t('site.compete.features.title')}
            />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((x, i) => (
                <motion.li key={x.k} {...reveal(i * 0.05)}>
                  <Card padding="lg" className="h-full">
                    <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-primary text-[var(--btn-primary-fg)]">
                      <x.icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-semibold">
                      {t(`site.compete.features.${x.k}.title`)}
                    </h3>
                    <p className="mt-2 text-sm text-muted">
                      {t(`site.compete.features.${x.k}.body`)}
                    </p>
                  </Card>
                </motion.li>
              ))}
            </ul>
            <div className="mt-16 grid gap-8 md:grid-cols-2">
              <motion.div {...reveal()}>
                <BrowserFrame
                  src={competeHome}
                  alt={t('site.compete.shots.home')}
                  url="yourarena.com"
                />
                <h3 className="mt-5 text-lg font-semibold">{t('site.compete.shots.homeTitle')}</h3>
                <p className="mt-1.5 text-sm text-muted">{t('site.compete.shots.homeBody')}</p>
              </motion.div>
              <motion.div {...reveal(0.1)}>
                <BrowserFrame
                  src={competeAdmin}
                  alt={t('site.compete.shots.admin')}
                  url="yourarena.com/admin"
                />
                <h3 className="mt-5 text-lg font-semibold">{t('site.compete.shots.adminTitle')}</h3>
                <p className="mt-1.5 text-sm text-muted">{t('site.compete.shots.adminBody')}</p>
              </motion.div>
            </div>
            <p className="mt-8 text-center text-xs text-muted">{t('site.compete.shots.caption')}</p>
          </div>
        </section>

        <RevenueExample />

        <section className="pb-24" aria-labelledby="compete-legal">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Card padding="lg" className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
              <span className="inline-flex size-12 items-center justify-center rounded-[14px] border border-border">
                <Scale className="size-6 text-accent" aria-hidden="true" />
              </span>
              <div>
                <h2 id="compete-legal" className="font-display text-2xl font-semibold">
                  {t('site.compete.legal.title')}
                </h2>
                <p className="mt-3 text-muted">{t('site.compete.legal.body')}</p>
                <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  {(t('site.compete.legal.points', { returnObjects: true }) as string[]).map(
                    (p) => (
                      <li key={p} className="flex gap-2">
                        <BadgeCheck
                          className="mt-0.5 size-4 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        {p}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </Card>
            <div className="mt-12 flex flex-col items-center gap-4 text-center">
              <Trophy className="size-8 text-accent" aria-hidden="true" />
              <h2 className="font-display text-3xl font-semibold">{t('site.compete.cta.title')}</h2>
              <p className="max-w-xl text-muted">{t('site.compete.cta.body')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button size="lg" asChild>
                  <Link to={`/${lang}#contact`}>{t('site.compete.hero.cta')}</Link>
                </Button>
                <Button size="lg" variant="secondary" asChild>
                  <Link to={`/${lang}/compete/admin/login`}>
                    {t('site.compete.cta.operatorLogin')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
