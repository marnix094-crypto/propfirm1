import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { EASE, GridBackdrop, WordReveal } from './fx';
import { HeroShowcase } from './showcase';

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
      className="relative overflow-hidden pt-12 pb-24 sm:pt-20 lg:pb-32"
      aria-labelledby="hero-title"
    >
      <GridBackdrop />
      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
        <div className="flex flex-col items-center">
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
            className="mt-6 font-display text-[2.4rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl xl:text-7xl"
          >
            <WordReveal text={t('site.hero.titleA')} />{' '}
            <WordReveal
              text={t('site.hero.titleB')}
              delay={0.25}
              wordClassName="text-lime-gradient"
            />
          </h1>
          <motion.p {...fade(0.5)} className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            {t('site.hero.body')}
          </motion.p>
          <motion.div {...fade(0.65)} className="mt-9 flex flex-wrap justify-center gap-3">
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
            className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted"
          >
            {(['p1', 'p2', 'p3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                {t(`site.hero.${k}`)}
              </li>
            ))}
          </motion.ul>
        </div>
      </div>
      <HeroShowcase />
    </section>
  );
}
