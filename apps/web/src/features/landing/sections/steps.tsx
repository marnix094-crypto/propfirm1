import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { BadgeCheck, CandlestickChart, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { LandingSection } from '../section';

const STEPS = [
  { key: 'choose', icon: BadgeCheck },
  { key: 'trade', icon: CandlestickChart },
  { key: 'payout', icon: Wallet },
] as const;

export function Steps() {
  const { t } = useTranslation();
  return (
    <LandingSection
      id="how-it-works"
      eyebrow={t('landing.steps.eyebrow')}
      title={t('landing.steps.title')}
      subtitle={t('landing.steps.subtitle')}
    >
      <div className="relative">
        {/* Connector line that draws itself (desktop). */}
        <svg
          aria-hidden="true"
          className="absolute top-[3.25rem] right-[16%] left-[16%] hidden h-2 lg:block"
          viewBox="0 0 100 2"
          preserveAspectRatio="none"
        >
          <motion.line
            x1="0"
            y1="1"
            x2="100"
            y2="1"
            stroke="var(--border-strong)"
            strokeWidth="2"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.3 }}
          />
        </svg>
        <RevealGroup className="relative grid gap-5 lg:grid-cols-3" stagger={0.12}>
          {STEPS.map(({ key, icon }, i) => (
            <RevealItem key={key}>
              <Card interactive padding="lg" className="h-full">
                <div className="flex items-center gap-4">
                  <IconTile icon={icon} size="lg" />
                  <span className="text-sm font-bold text-accent tabular-nums">
                    {t('landing.steps.step', { n: i + 1 })}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">
                  {t(`landing.steps.${key}.title`)}
                </h3>
                <p className="mt-2 text-muted">{t(`landing.steps.${key}.body`)}</p>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </LandingSection>
  );
}
