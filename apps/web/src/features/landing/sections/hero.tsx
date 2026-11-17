import { useTranslation } from 'react-i18next';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GradientHeading } from '@/components/ui/gradient-heading';
import { Reveal } from '@/components/motion/reveal';
import { AccountOverview } from '@/components/dashboard/account-overview';
import { exampleOverview } from '../example-overview';
import { PayoutNotification } from './payout-notification';

export function Hero() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="hero-title" className="relative pt-12 sm:pt-20">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <Reveal>
          <Badge variant="primary" className="mb-6">
            <ShieldCheck aria-hidden="true" /> {t('landing.hero.badge')}
          </Badge>
          <GradientHeading as="h1" id="hero-title" className="mx-auto max-w-4xl">
            {t('landing.hero.title')}
          </GradientHeading>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            {t('landing.hero.subtitle')}
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <a href="#pricing">
                {t('landing.hero.ctaPrimary')} <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <a href="#how-it-works">{t('landing.hero.ctaSecondary')}</a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-muted">{t('landing.hero.note')}</p>
        </Reveal>
      </div>

      {/* Partially visible dashboard preview (real component, example data). */}
      <div className="relative mx-auto mt-14 max-w-5xl px-4 sm:mt-20 sm:px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 -top-10 h-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--glow-aqua)_35%,transparent),transparent),radial-gradient(closest-side,color-mix(in_srgb,var(--glow-lavender)_35%,transparent),transparent)] bg-[length:60%_100%,60%_100%] bg-[position:0_0,100%_0] bg-no-repeat blur-2xl"
        />
        <Reveal className="relative max-h-[440px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_62%,transparent)] sm:max-h-[480px]">
          <AccountOverview data={exampleOverview} badges={<Badge>{t('common.example')}</Badge>} />
        </Reveal>
        <PayoutNotification className="absolute bottom-4 left-6 sm:right-2 sm:bottom-10 sm:left-auto lg:-right-10" />
      </div>
    </section>
  );
}
