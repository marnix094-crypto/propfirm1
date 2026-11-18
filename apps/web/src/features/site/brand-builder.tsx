import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';
import brandLime from '@/assets/site/brand-lime.webp';
import brandOrange from '@/assets/site/brand-orange.webp';
import brandCyan from '@/assets/site/brand-cyan.webp';
import brandViolet from '@/assets/site/brand-violet.webp';
import adminBranding from '@/assets/site/admin-branding.webp';
import adminModules from '@/assets/site/admin-modules.webp';
import { SHOWCASE_BRANDS } from '@/config/brand-builder';
import { EASE, SectionTitle } from './fx';
import { BrowserFrame } from './showcase';

const SHOTS = { lime: brandLime, orange: brandOrange, cyan: brandCyan, violet: brandViolet };
const BRANDS = SHOWCASE_BRANDS.map((b) => ({ ...b, shot: SHOTS[b.key] }));

const STEPS = [
  { key: 'brand', shot: adminBranding, url: 'app.yourfirm.com/admin/branding' },
  { key: 'modules', shot: adminModules, url: 'app.yourfirm.com/admin/dashboard' },
] as const;

/** "Build your prop firm": real screenshots of the same platform in four example brands. */
export function BrandBuilder() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [active, setActive] = useState<(typeof BRANDS)[number]['key']>('orange');
  const brand = BRANDS.find((b) => b.key === active)!;
  const reveal = (delay = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 32 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '0px 0px -10% 0px' },
          transition: { duration: 0.8, ease: EASE, delay },
        };

  return (
    <section
      id="brand-builder"
      className="scroll-mt-20 py-24 sm:py-32"
      aria-labelledby="builder-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          id="builder-title"
          eyebrow={t('site.builder.eyebrow')}
          title={t('site.builder.title')}
          body={t('site.builder.body')}
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
          <motion.div {...reveal()} className="flex flex-col gap-6">
            <fieldset>
              <legend className="text-sm font-semibold">{t('site.builder.pickBrand')}</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
                {BRANDS.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    aria-pressed={active === b.key}
                    onClick={() => setActive(b.key)}
                    className={cn(
                      'flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left text-sm font-semibold transition-colors',
                      active === b.key
                        ? 'border-primary bg-card'
                        : 'border-border bg-card/40 text-muted hover:border-border-strong hover:text-fg',
                    )}
                  >
                    {/* Example customer colours are content, shown as swatches. */}
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded-full ring-2 ring-white/20"
                      style={{ backgroundColor: b.swatch }}
                    />
                    {b.name}
                  </button>
                ))}
              </div>
            </fieldset>
            <ol className="flex flex-col gap-4 text-sm">
              {(['1', '2', '3'] as const).map((n) => (
                <li key={n} className="flex gap-3">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-[var(--btn-primary-fg)]">
                    {n}
                  </span>
                  <span>
                    <span className="block font-semibold">{t(`site.builder.step${n}.title`)}</span>
                    <span className="block text-muted">{t(`site.builder.step${n}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.div>

          <motion.div {...reveal(0.15)} className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-8 rounded-[40px] opacity-60 blur-3xl transition-colors duration-700"
              style={{
                background: `radial-gradient(closest-side, ${brand.swatch}55, transparent)`,
              }}
            />
            <div className="relative">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={brand.key}
                  initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.01 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <BrowserFrame
                    src={brand.shot}
                    alt={t('site.builder.shotAlt', { firm: brand.name })}
                    url={brand.domain}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <motion.div key={s.key} {...reveal(i * 0.12)}>
              <BrowserFrame src={s.shot} alt={t(`site.builder.admin.${s.key}.alt`)} url={s.url} />
              <h3 className="mt-5 text-lg font-semibold">
                {t(`site.builder.admin.${s.key}.title`)}
              </h3>
              <p className="mt-1.5 text-sm text-muted">{t(`site.builder.admin.${s.key}.body`)}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted">{t('site.shots.caption')}</p>
      </div>
    </section>
  );
}
