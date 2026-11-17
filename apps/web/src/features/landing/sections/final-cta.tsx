import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';

export function FinalCta() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="final-cta-title" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-card bg-[image:var(--cta-gradient)] px-6 py-14 text-center text-[var(--cta-fg)] shadow-float sm:px-12 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-[var(--glow-aqua)] opacity-30 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-[var(--glow-lavender)] opacity-40 blur-3xl"
            />
            <h2
              id="final-cta-title"
              className="relative mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl"
            >
              {t('landing.cta.title')}
            </h2>
            <p className="relative mx-auto mt-5 max-w-2xl text-lg opacity-90">
              {t('landing.cta.subtitle')}
            </p>
            <a
              href="#pricing"
              className="relative mt-9 inline-flex h-13 items-center gap-2 rounded-btn bg-[var(--cta-btn-bg)] px-7 font-semibold text-[var(--cta-btn-fg)] shadow-[0_10px_30px_-10px_rgb(7_17_31/0.6)] transition-transform focus-visible:outline-[var(--cta-fg)] motion-safe:hover:-translate-y-px"
            >
              {t('landing.cta.button')} <ArrowRight className="size-[1.1em]" aria-hidden="true" />
            </a>
            <p className="relative mt-5 text-sm opacity-90">{t('landing.cta.note')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
