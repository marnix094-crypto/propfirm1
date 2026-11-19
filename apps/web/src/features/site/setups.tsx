import { useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import competeDashboard from '@/assets/site/compete-dashboard.webp';
import { EASE, SectionTitle } from './fx';
import { BrowserFrame } from './showcase';

const TABS = ['firm', 'compete'] as const;
type Tab = (typeof TABS)[number];
const FIRM_PLANS = ['shared', 'domain', 'instance'] as const;

/** "Choose your setup": the ways a customer can run Daily Funded (no prices — on request). */
export function Setups() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>('firm');

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i + TABS.length - 1) % TABS.length
          : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]!);
    document.getElementById(`setup-tab-${TABS[next]}`)?.focus();
  };

  return (
    <section
      id="setups"
      className="relative scroll-mt-20 py-24 sm:py-32"
      aria-labelledby="setups-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          id="setups-title"
          className="mx-auto text-center [&>p]:mx-auto"
          eyebrow={t('site.setups.eyebrow')}
          title={t('site.setups.title')}
          body={t('site.setups.body')}
        />
        <div
          role="tablist"
          aria-label={t('site.setups.tabs')}
          className="glow-card mx-auto mt-10 flex w-fit gap-1 rounded-[18px] p-1.5"
        >
          {TABS.map((k, i) => (
            <button
              key={k}
              id={`setup-tab-${k}`}
              role="tab"
              type="button"
              aria-selected={tab === k}
              aria-controls="setup-panel"
              tabIndex={tab === k ? 0 : -1}
              onClick={() => setTab(k)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                'relative rounded-[13px] px-5 py-2.5 text-sm font-semibold transition-colors',
                tab === k ? 'text-[var(--btn-primary-fg)]' : 'text-muted hover:text-fg',
              )}
            >
              {tab === k && (
                <motion.span
                  layoutId="setup-pill"
                  className="absolute inset-0 rounded-[13px] bg-primary shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_45%,transparent)]"
                  transition={
                    reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                />
              )}
              <span className="relative">{t(`site.setups.tab.${k}`)}</span>
            </button>
          ))}
        </div>

        <div
          id="setup-panel"
          role="tabpanel"
          aria-labelledby={`setup-tab-${tab}`}
          className="mt-12"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {tab === 'firm' ? (
                <ul className="grid items-stretch gap-5 lg:grid-cols-3">
                  {FIRM_PLANS.map((p) => {
                    const featured = p === 'domain';
                    return (
                      <li
                        key={p}
                        className={cn(
                          'glow-card flex flex-col p-6 sm:p-7',
                          featured && 'glow-card-strong lg:-my-3 lg:py-10',
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-muted">
                            {t(`site.setups.plans.${p}.label`)}
                          </p>
                          {featured && (
                            <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-[var(--btn-primary-fg)]">
                              {t('site.setups.recommended')}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight">
                          {t(`site.setups.plans.${p}.title`)}
                        </h3>
                        <p className="mt-2 text-sm text-muted">
                          {t(`site.setups.plans.${p}.body`)}
                        </p>
                        <div className="my-6 h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />
                        <ul className="flex flex-1 flex-col gap-3 text-sm">
                          {(
                            t(`site.setups.plans.${p}.points`, { returnObjects: true }) as string[]
                          ).map((pt) => (
                            <li key={pt} className="flex gap-3">
                              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-accent">
                                <Check className="size-3.5" aria-hidden="true" />
                              </span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                        <Button
                          className="mt-8"
                          variant={featured ? 'primary' : 'secondary'}
                          fullWidth
                          asChild
                        >
                          <a href={`/${lang}#contact`}>{t('site.setups.cta')}</a>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="glow-card grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.3fr]">
                  <div>
                    <p className="text-sm font-semibold text-muted">
                      {t('site.setups.compete.label')}
                    </p>
                    <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight">
                      {t('site.setups.compete.title')}
                    </h3>
                    <p className="mt-3 text-muted">{t('site.setups.compete.body')}</p>
                    <ul className="mt-6 flex flex-col gap-3 text-sm">
                      {(t('site.setups.compete.points', { returnObjects: true }) as string[]).map(
                        (pt) => (
                          <li key={pt} className="flex gap-3">
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-accent"
                              aria-hidden="true"
                            />
                            {pt}
                          </li>
                        ),
                      )}
                    </ul>
                    <Button className="mt-8" asChild>
                      <Link to={`/${lang}/products/compete`}>
                        {t('site.setups.compete.cta')} <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                  <BrowserFrame
                    src={competeDashboard}
                    alt={t('site.compete.shots.dashboard')}
                    url="play.yourarena.com"
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="mt-8 text-center text-xs text-muted">{t('site.setups.note')}</p>
      </div>
    </section>
  );
}
