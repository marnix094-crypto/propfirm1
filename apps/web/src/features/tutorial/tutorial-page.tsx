import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { PageHeader } from '@/components/ui/panel';

export const TUTORIAL_STEPS = ['start', 'trade', 'rules', 'funded', 'payouts', 'review'] as const;
const LINKS: Partial<Record<(typeof TUTORIAL_STEPS)[number], string>> = {
  trade: 'trade',
  rules: 'portfolio',
  funded: 'new-account',
  payouts: 'withdrawal',
  review: 'stats',
};

/** Step-by-step guide to the platform (text; videos can be added later). */
export function TutorialPage() {
  const { t } = useTranslation();
  const { lang } = useParams();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={t('app.nav.tutorial')} subtitle={t('tutorial.subtitle')} />
      <Accordion type="single" collapsible defaultValue="start">
        {TUTORIAL_STEPS.map((step, i) => {
          const body = t(`tutorial.steps.${step}.body`, { returnObjects: true }) as string[];
          const link = LINKS[step];
          return (
            <AccordionItem
              key={step}
              value={step}
              question={
                <span className="flex items-center gap-3">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-xs font-bold text-[var(--btn-primary-fg)] tabular-nums">
                    {i + 1}
                  </span>
                  {t(`tutorial.steps.${step}.title`)}
                </span>
              }
            >
              <div className="flex flex-col gap-2">
                {body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {link && (
                  <Link
                    to={`/${lang}/app/${link}`}
                    className="mt-1 self-start text-sm font-semibold text-link hover:underline"
                  >
                    {t(`tutorial.steps.${step}.cta`)} →
                  </Link>
                )}
              </div>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
