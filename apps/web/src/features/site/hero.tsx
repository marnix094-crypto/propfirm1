import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { EASE, GridBackdrop, Tilt, WordReveal } from './fx';

const CAL = [3, -1, 2, 0, 4, -2, 1, 3, 0, -1, 2, 5, 1, -3, 2, 0, 3, 1, -1, 4, 2];
const LINE =
  'M0 120 C 30 110, 50 118, 80 96 S 130 104, 160 80 S 210 92, 240 62 S 290 70, 320 44 S 370 52, 400 24';

/** Illustrated product stage (example data, decorative). */
function ProductStage() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const appear = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, ease: EASE, delay },
        };
  return (
    <div className="relative mx-auto w-full max-w-[560px] [perspective:1200px]">
      <p className="sr-only">{t('site.hero.stageLabel')}</p>
      <Tilt className="relative">
        <motion.div
          {...appear(0.3)}
          aria-hidden="true"
          className="rounded-[20px] border border-border bg-card p-4 shadow-float sm:p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-[var(--btn-primary-fg)]">
                YF
              </span>
              <span className="text-sm font-semibold">{t('site.hero.stageFirm')}</span>
            </div>
            <span className="rounded-full border border-dashed border-border-strong px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
              {t('site.example')}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(
              [
                ['site.hero.kpiEquity', '$52,480'],
                ['site.hero.kpiToday', '+$412'],
                ['site.hero.kpiWin', '61%'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-card-muted p-2.5">
                <p className="text-[10px] text-muted">{t(k)}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums sm:text-base">{v}</p>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 400 130" className="mt-3 h-28 w-full sm:h-32">
            <defs>
              <linearGradient id="stage-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--chart-line)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--chart-line)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              d={`${LINE} L400 130 L0 130 Z`}
              fill="url(#stage-fill)"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4, duration: 0.8 }}
            />
            <motion.path
              d={LINE}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.6, duration: 1.6, ease: EASE }}
            />
          </svg>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {CAL.map((v, i) => (
              <motion.span
                key={i}
                className="h-6 rounded-[5px] border border-border"
                style={{
                  backgroundColor:
                    v === 0
                      ? 'var(--card-muted)'
                      : `color-mix(in srgb, var(${v > 0 ? '--profit' : '--loss'}) ${15 + Math.abs(v) * 12}%, transparent)`,
                }}
                initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1 + i * 0.035, duration: 0.35, ease: EASE }}
              />
            ))}
          </div>
        </motion.div>

        <motion.div
          {...appear(0.9)}
          aria-hidden="true"
          className="absolute -top-6 -right-2 w-52 rounded-xl border border-border bg-card p-3 shadow-float sm:-right-8"
        >
          <p className="text-[11px] font-semibold">{t('site.hero.meter')}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]">
            <motion.div
              className="h-full origin-left rounded-full bg-[var(--meter-safe)]"
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 0.38 }}
              transition={{ delay: 1.2, duration: 1.2, ease: EASE }}
            />
          </div>
          <p className="mt-1.5 flex justify-between text-[10px] text-muted tabular-nums">
            <span>$380</span>
            <span>$1,500</span>
          </p>
        </motion.div>

        <motion.div
          {...appear(1.3)}
          aria-hidden="true"
          className="absolute -bottom-6 -left-2 flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-float sm:-left-10"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-[var(--btn-primary-fg)]">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <span>
            <span className="block text-xs font-semibold">{t('site.hero.toastTitle')}</span>
            <span className="block text-[10px] text-muted">{t('site.hero.toastBody')}</span>
          </span>
        </motion.div>
      </Tilt>
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
      <GridBackdrop />
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
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
            className="mt-6 font-display text-[2.4rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl xl:text-7xl"
          >
            <WordReveal text={t('site.hero.titleA')} />{' '}
            <WordReveal
              text={t('site.hero.titleB')}
              delay={0.25}
              wordClassName="text-lime-gradient"
            />
          </h1>
          <motion.p {...fade(0.5)} className="mt-6 max-w-xl text-lg text-muted sm:text-xl">
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
            className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"
          >
            {(['p1', 'p2', 'p3'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
                {t(`site.hero.${k}`)}
              </li>
            ))}
          </motion.ul>
        </div>
        <ProductStage />
      </div>
    </section>
  );
}
