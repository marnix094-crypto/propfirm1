import { useTranslation } from 'react-i18next';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { Reveal } from '@/components/motion/reveal';
import { LandingSection } from '../section';

export const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;

export function Faq() {
  const { t } = useTranslation();
  return (
    <LandingSection id="faq" eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')}>
      <Reveal className="mx-auto max-w-3xl">
        <Accordion type="single" collapsible>
          {FAQ_KEYS.map((k) => (
            <AccordionItem key={k} value={k} question={t(`landing.faq.${k}.q`)}>
              {t(`landing.faq.${k}.a`)}
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </LandingSection>
  );
}
