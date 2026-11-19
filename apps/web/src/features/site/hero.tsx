import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { EASE, WordReveal } from './fx';
import { PlatformHub, RotatingBadge } from './hub';
import { HeroShowcase } from './showcase';

const STATS = ['setup', 'brand', 'langs', 'eu'] as const;

/** Atmosphere behind the hero: light beams, dotted field and a lime glow (decorative). */
export function HeroAtmosphere() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="dot-field absolute inset-0 opacity-70" />
      <motion.div
        className="light-beams absolute -top-24 left-1/2 h-[780px] w-[1400px] -translate-x-1/2"
        animate={reduce ? undefined : { opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 7, ease: 'easeInOut', repeat: Infinity }}
      />
      <div className="absolute top-[-12%] left-[55%] h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_22%,transparent),transparent)] blur-2xl" />
    </div>
  );
}

export function SiteHero() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const reduce = useReducedMotion();
  const fade = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: EASE, delay },
        };
  return (
    <section
      className="relative overflow-hidden pt-10 pb-24 sm:pt-16 lg:pb-32"
      aria-labelledby="hero-title"
    >
      <HeroAtmosphere />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.p
            {...fade(0)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-xs font-semibold text-muted backdrop-blur"
          >
            <span
              className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
              aria-hidden="true"
            />
            {t('site.hero.eyebrow')}
          </motion.p>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[2.4rem] leading-[1.03] font-semibold tracking-tight text-balance sm:text-6xl xl:text-[4.4rem]"
          >
            <WordReveal text={t('site.hero.titleA')} />{' '}
            <WordReveal
              text={t('site.hero.titleB')}
              delay={0.25}
              wordClassName="text-lime-gradient"
            />
          </h1>
          <motion.p {...fade(0.5)} className="mt-6 max-w-xl text-lg text-muted">
            {t('site.hero.body')}
          </motion.p>
          <motion.div {...fade(0.65)} className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <a href={`/${lang}#contact`}>
                {t('site.nav.bookDemo')} <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to={`/${lang}/login`}>{t('site.hero.seeStorefront')}</Link>
            </Button>
          </motion.div>
          <motion.ul
            {...fade(0.8)}
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
          >
            {(['p1', 'p2', 'p3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                {t(`site.hero.${k}`)}
              </li>
            ))}
          </motion.ul>
        </div>
        <motion.div {...fade(0.3)}>
          <PlatformHub />
        </motion.div>
      </div>

      <div className="relative mx-auto mt-16 flex max-w-7xl items-center gap-4 px-4 sm:px-6">
        <ul className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((k, i) => (
            <motion.li
              key={k}
              className="glow-card glass px-5 py-4"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
            >
              <p className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {t(`site.hero.stats.${k}.value`)}
              </p>
              <p className="mt-1 text-sm text-muted">{t(`site.hero.stats.${k}.label`)}</p>
            </motion.li>
          ))}
        </ul>
        <div className="hidden shrink-0 lg:block">
          <RotatingBadge label={t('site.nav.bookDemo')} href={`/${lang}#contact`} />
        </div>
      </div>
      <HeroShowcase />
    </section>
  );
}
